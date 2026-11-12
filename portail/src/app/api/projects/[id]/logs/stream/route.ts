import { NextRequest, NextResponse } from 'next/server'
import type { BuildPlan } from '@eflex/detector'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { getApplicationLogs } from '@/lib/coolify'
import { decrypt } from '@/lib/crypto'
import { getPrimaryApp } from '@/lib/project-primary'
import { sseResponse } from '@/lib/sse'
import { streamRuntimeLogs } from '@/lib/runtime-log-stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_STREAMS_PER_USER = 5
const open = new Map<string, number>()

/**
 * Journaux d'exécution du conteneur en direct (SSE), par sondage de Coolify.
 * Isolation par organisation, rôle facturation exclu, secrets connus masqués.
 * Reprise : `Last-Event-ID` (reconnexion navigateur) ou `?from=`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
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

  if ((open.get(userId) ?? 0) >= MAX_STREAMS_PER_USER) {
    return NextResponse.json(
      { error: 'Trop de flux ouverts. Fermez un onglet de journaux puis réessayez.' },
      { status: 429 },
    )
  }

  const search = new URL(request.url).searchParams
  const requestedAppId = search.get('appId')?.trim() || null

  let targetApp = null as null | { id: string; name: string; position: number; coolifyAppId: string | null; plan: unknown }
  if (requestedAppId) {
    targetApp = project.apps.find((app) => app.id === requestedAppId) ?? null
    if (!targetApp) return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
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
  const composeServices = plan && plan.framework === 'compose' ? (plan.compose?.services ?? []) : []
  const requestedService = search.get('service')?.trim() ?? ''
  if (requestedService !== '' && !composeServices.includes(requestedService)) {
    return NextResponse.json({ error: 'Service inconnu pour cette application.' }, { status: 400 })
  }

  const secrets: string[] = []
  for (const variable of project.envVars) {
    if (variable.appId && targetApp && variable.appId !== targetApp.id) continue
    try {
      secrets.push(decrypt(variable.value, `${project.id}:${variable.key}`))
    } catch {
      /* variable illisible : impossible à masquer */
    }
  }

  const lastEventId = Number.parseInt(request.headers.get('last-event-id') ?? search.get('from') ?? '', 10)
  const from = Number.isFinite(lastEventId)
    ? lastEventId + (request.headers.has('last-event-id') ? 1 : 0)
    : 0

  open.set(userId, (open.get(userId) ?? 0) + 1)
  const release = () => open.set(userId, Math.max(0, (open.get(userId) ?? 1) - 1))

  return sseResponse(
    async (send, signal) => {
      try {
        if (!process.env.COOLIFY_API_URL || !process.env.COOLIFY_API_TOKEN) {
          send('warn', {
            message:
              "Les journaux d'exécution en direct sont indisponibles : le service de déploiement n'est pas configuré sur cette plateforme.",
          })
          send('end', { reason: 'unavailable' })
          return
        }
        await streamRuntimeLogs({
          client: {
            getLogs: (lines, serviceName) => getApplicationLogs(coolifyAppId, lines, serviceName),
          },
          secrets,
          lines: 300,
          serviceName: requestedService === '' ? undefined : requestedService,
          from,
          send,
          signal,
        })
      } finally {
        release()
      }
    },
    { signal: request.signal },
  )
}
