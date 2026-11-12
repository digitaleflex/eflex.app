import { NextRequest, NextResponse } from 'next/server'
import type { BuildPlan } from '@eflex/detector'
import { getSession } from '@/lib/session'
import { getApplicationLogs } from '@/lib/coolify'
import { decrypt } from '@/lib/crypto'
import { collectProjectSecretValues, countSuspiciousLines, parseLogs, sanitizeLogText } from '@/lib/log-lines'
import { allow, allowOrg } from '@/lib/rate-limit'
import { getPrimaryApp } from '@/lib/project-primary'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Journaux d'exécution du conteneur, secrets connus masqués. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!(await allow(`runtime-logs:${session.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: 'Trop de lectures de journaux. Patientez une minute.' }, { status: 429 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  // Le rôle facturation ne doit jamais accéder aux journaux d'exécution (#27).
  if (org.role === 'billing') {
    return NextResponse.json({ error: 'Le rôle facturation n’a pas accès aux journaux.' }, { status: 403 })
  }
  if (!(await allowOrg(org.organizationId, 'runtime-logs', 120, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de lectures de journaux pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, {
    id: true,
    coolifyAppId: true,
    plan: true,
    envVars: { select: { key: true, value: true, appId: true } },
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, coolifyAppId: true, plan: true },
    },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as any

  const search = new URL(request.url).searchParams
  const requestedAppId = search.get('appId')?.trim() || null

  let targetApp = null as null | { id: string; name: string; position: number; coolifyAppId: string | null; plan: unknown }
  const apps = project.apps as Array<{ id: string; name: string; position: number; coolifyAppId: string | null; plan: unknown }>
  if (requestedAppId) {
    targetApp = apps.find((app) => app.id === requestedAppId) ?? null
    if (!targetApp) {
      return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
    }
  } else if (apps.length > 0) {
    targetApp =
      apps.find((app) => app.coolifyAppId) ??
      getPrimaryApp(apps as any) ??
      apps[0] ??
      null
  }

  const coolifyAppId = project.apps.length > 0 ? (targetApp?.coolifyAppId ?? null) : project.coolifyAppId
  if (!coolifyAppId) {
    return NextResponse.json({ error: "Cette application n'a pas encore été déployée." }, { status: 409 })
  }

  const plan = (project.apps.length > 0 ? targetApp?.plan : project.plan) as unknown as BuildPlan | null

  const linesParam = Number.parseInt(search.get('lines') ?? '', 10)
  const lines = Number.isFinite(linesParam) ? Math.min(2000, Math.max(50, linesParam)) : 300
  const format = (search.get('format') ?? 'json').toLowerCase()

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

  const secrets = collectProjectSecretValues(project.envVars, project.id, targetApp?.id ?? null, decrypt)
  const parsed = parseLogs(result.logs)
  const suspiciousCount = countSuspiciousLines(parsed, secrets)
  const prepared = parsed.map((line) => {
    const raw = line.ts ? `${line.ts} ${line.text}` : line.text
    const safe = sanitizeLogText(raw, secrets)
    return { n: line.n, ts: line.ts, text: safe.text, truncated: safe.truncated }
  })
  const text = prepared.map((line) => line.text).join('\n')
  const updatedAt = new Date().toISOString()
  const headers = { 'Cache-Control': 'no-store, max-age=0' }

  if (format === 'text') {
    return new NextResponse(text + (text ? '\n' : ''), {
      headers: {
        ...headers,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'inline; filename="runtime-logs.txt"',
      },
    })
  }

  if (format === 'ndjson') {
    const body =
      prepared
        .map((line) =>
          JSON.stringify({
            n: line.n,
            ...(line.ts ? { ts: line.ts } : {}),
            text: line.text,
            ...(line.truncated ? { truncated: true } : {}),
          }),
        )
        .join('\n') + (prepared.length ? '\n' : '')
    return new NextResponse(body, {
      headers: {
        ...headers,
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': 'inline; filename="runtime-logs.ndjson"',
      },
    })
  }

  return NextResponse.json(
    {
      logs: text,
      lines: prepared,
      updatedAt,
      appId: targetApp?.id ?? null,
      lineCount: prepared.length,
      truncatedLines: prepared.filter((line) => line.truncated).length,
      suspicious: suspiciousCount > 0,
      suspiciousCount,
      window: { requested: lines, returned: prepared.length },
      note: 'Fenêtre récente masquée (les valeurs connues sont remplacées par ***).',
    },
    { headers },
  )
}
