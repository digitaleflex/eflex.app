import { NextRequest, NextResponse } from 'next/server'
import type { BuildPlan } from '@eflex/detector'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { getApplicationLogs } from '@/lib/coolify'
import { decrypt } from '@/lib/crypto'
import { maskSecrets, parseLogs } from '@/lib/log-lines'
import { allow } from '@/lib/rate-limit'
import { getPrimaryApp } from '@/lib/project-primary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Journaux d'exécution du conteneur, secrets connus masqués. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!(await allow(`runtime-logs:${session.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: 'Trop de lectures de journaux. Patientez une minute.' }, { status: 429 })
  }

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  // Le rôle facturation ne doit jamais accéder aux journaux d'exécution (#27).
  if (org.role === 'billing') {
    return NextResponse.json({ error: 'Le rôle facturation n’a pas accès aux journaux.' }, { status: 403 })
  }

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      coolifyAppId: true,
      plan: true,
      envVars: { select: { key: true, value: true, appId: true } },
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, position: true, coolifyAppId: true, plan: true },
      },
    },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const search = new URL(request.url).searchParams
  const requestedAppId = search.get('appId')?.trim() || null

  let targetApp = null as null | { id: string; name: string; position: number; coolifyAppId: string | null; plan: unknown }
  if (requestedAppId) {
    targetApp = project.apps.find((app) => app.id === requestedAppId) ?? null
    if (!targetApp) {
      return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
    }
  } else if (project.apps.length > 0) {
    targetApp =
      project.apps.find((app) => app.coolifyAppId) ??
      getPrimaryApp(project.apps) ??
      project.apps[0] ??
      null
  }

  const coolifyAppId = project.apps.length > 0 ? (targetApp?.coolifyAppId ?? null) : project.coolifyAppId
  if (!coolifyAppId) {
    return NextResponse.json({ error: "Cette application n'a pas encore été déployée." }, { status: 409 })
  }

  const plan = (project.apps.length > 0 ? targetApp?.plan : project.plan) as unknown as BuildPlan | null

  const linesParam = Number.parseInt(search.get('lines') ?? '', 10)
  const lines = Number.isFinite(linesParam) ? Math.min(500, Math.max(50, linesParam)) : 200

  // Logs par service : uniquement pour un compose fourni par le dépôt, et
  // uniquement un service réellement déclaré (jamais un nom arbitraire).
  const composeServices =
    plan && plan.framework === 'compose' ? (plan.compose?.services ?? []) : []
  const requestedService = search.get('service')?.trim() ?? ''
  if (requestedService !== '' && !composeServices.includes(requestedService)) {
    return NextResponse.json({ error: 'Service inconnu pour cette application.' }, { status: 400 })
  }

  const result = await getApplicationLogs(
    coolifyAppId,
    lines,
    requestedService === '' ? undefined : requestedService,
  )
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  const secrets: string[] = []
  for (const variable of project.envVars) {
    // Les variables projet (sans appId) s'appliquent à toutes les apps ; les
    // variables d'app (lot ultérieur) gardent la même AAD `projectId:key`.
    if (variable.appId && targetApp && variable.appId !== targetApp.id) continue
    try {
      secrets.push(decrypt(variable.value, `${project.id}:${variable.key}`))
    } catch {
      // Variable illisible : elle ne peut pas être masquée, on l'ignore.
    }
  }

  const text = maskSecrets(
    parseLogs(result.logs)
      .map((line) => (line.ts ? `${line.ts} ${line.text}` : line.text))
      .join('\n'),
    secrets,
  )

  return NextResponse.json(
    { logs: text, updatedAt: new Date().toISOString(), appId: targetApp?.id ?? null },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
