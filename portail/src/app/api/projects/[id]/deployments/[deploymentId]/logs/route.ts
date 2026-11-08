import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { CoolifyClient, loadCoolifyConfig } from '@/lib/coolify'
import { streamDeploymentLogs } from '@/lib/deployment-stream'
import { sseResponse } from '@/lib/sse'
import { publish } from '@/lib/event-bus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Un navigateur ouvre un flux par onglet : on borne le total par utilisateur pour éviter l'abus.
const MAX_STREAMS_PER_USER = 5
const open = new Map<string, number>()

/**
 * Journaux d'un déploiement en direct (Server-Sent Events).
 * Réservé aux membres de l'organisation propriétaire du projet ; secrets masqués.
 * Reprise : en-tête `Last-Event-ID` (envoyé seul par le navigateur à la reconnexion) ou `?from=`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id

  const org = await resolveOrganization(session)
  const { id, deploymentId } = await params
  // Projet et déploiement doivent appartenir à l'organisation de l'utilisateur : sinon 404.
  const deployment = org
    ? await prisma.deployment.findFirst({
        where: { id: deploymentId, projectId: id, project: { organizationId: org.organizationId } },
        select: { status: true, coolifyBuildId: true, logsSummary: true, project: { select: { envVars: { select: { value: true } } } } },
      })
    : null
  if (!deployment) return NextResponse.json({ error: 'Déploiement introuvable' }, { status: 404 })

  if ((open.get(userId) ?? 0) >= MAX_STREAMS_PER_USER) {
    return NextResponse.json({ error: 'Trop de flux ouverts. Fermez un onglet de journaux puis réessayez.' }, { status: 429 })
  }

  const url = new URL(request.url)
  const lastEventId = Number.parseInt(request.headers.get('last-event-id') ?? url.searchParams.get('from') ?? '', 10)
  const from = Number.isFinite(lastEventId) ? lastEventId + (request.headers.has('last-event-id') ? 1 : 0) : 0

  let client: CoolifyClient | null = null
  try {
    client = new CoolifyClient(loadCoolifyConfig(), fetch, 8_000)
  } catch {
    client = null // Coolify non configuré : on rejoue le résumé enregistré.
  }

  open.set(userId, (open.get(userId) ?? 0) + 1)
  const release = () => open.set(userId, Math.max(0, (open.get(userId) ?? 1) - 1))

  const response = sseResponse(
    async (send, signal) => {
      try {
        if (!client && deployment.coolifyBuildId) {
          send('warn', { message: "Les journaux en direct sont indisponibles : Coolify n'est pas configuré sur cette plateforme." })
        }
        await streamDeploymentLogs({
          client: client ?? { getDeployment: async () => { throw new Error('Coolify non configuré') } },
          deployment: { status: deployment.status, coolifyBuildId: client ? deployment.coolifyBuildId : null, logsSummary: deployment.logsSummary },
          secrets: deployment.project.envVars.map((v) => v.value),
          from,
          send,
          signal,
          onFinished: async (result) => {
            const changed = result.status !== deployment.status
            await prisma.deployment.update({ where: { id: deploymentId }, data: result })
            if (changed && org) {
              await publish({ type: 'deployment.status', organizationId: org.organizationId, payload: { projectId: id, deploymentId, status: result.status } })
            }
          },
        })
      } finally {
        release()
      }
    },
    { signal: request.signal },
  )
  return response
}
