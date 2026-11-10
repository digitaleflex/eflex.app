import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { getDeploymentDetails } from '@/lib/coolify'
import { decrypt } from '@/lib/crypto'
import { streamDeploymentLogs } from '@/lib/deployment-stream'
import { sseResponse } from '@/lib/sse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Un navigateur ouvre un flux par onglet : on borne le total par utilisateur pour éviter l'abus.
const MAX_STREAMS_PER_USER = 5
const open = new Map<string, number>()

/**
 * Journaux d'un déploiement en direct (Server-Sent Events).
 * Réservé aux membres de l'organisation propriétaire du projet ; secrets masqués.
 * Reprise : en-tête `Last-Event-ID` (envoyé seul par le navigateur à la reconnexion) ou `?from=`.
 * Lecture seule : l'état du déploiement en base est écrit par le worker, jamais ici.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id

  const org = await resolveOrganization(session)
  // Le rôle facturation ne doit jamais accéder aux journaux de build (#27).
  if (org?.role === 'billing') {
    return NextResponse.json({ error: 'Le rôle facturation n’a pas accès aux journaux.' }, { status: 403 })
  }
  const { id, deploymentId } = await params
  // Projet et déploiement doivent appartenir à l'organisation de l'utilisateur : sinon 404.
  const deployment = org
    ? await prisma.deployment.findFirst({
        where: { id: deploymentId, projectId: id, project: { organizationId: org.organizationId } },
        select: { status: true, coolifyBuildId: true, logsSummary: true, project: { select: { id: true, envVars: { select: { key: true, value: true } } } } },
      })
    : null
  if (!deployment) return NextResponse.json({ error: 'Déploiement introuvable' }, { status: 404 })

  if ((open.get(userId) ?? 0) >= MAX_STREAMS_PER_USER) {
    return NextResponse.json({ error: 'Trop de flux ouverts. Fermez un onglet de journaux puis réessayez.' }, { status: 429 })
  }

  const url = new URL(request.url)
  const lastEventId = Number.parseInt(request.headers.get('last-event-id') ?? url.searchParams.get('from') ?? '', 10)
  const from = Number.isFinite(lastEventId) ? lastEventId + (request.headers.has('last-event-id') ? 1 : 0) : 0

  // Les valeurs sont chiffrées en base : on les déchiffre pour pouvoir les masquer dans les journaux.
  // Une valeur illisible est ignorée (elle ne peut pas fuiter sous une forme qu'on ne connaît pas).
  const secrets: string[] = []
  for (const variable of deployment.project.envVars) {
    try {
      secrets.push(decrypt(variable.value, `${deployment.project.id}:${variable.key}`))
    } catch {
      /* variable illisible */
    }
  }

  const configured = Boolean(process.env.COOLIFY_API_URL && process.env.COOLIFY_API_TOKEN)
  const buildId = deployment.coolifyBuildId

  open.set(userId, (open.get(userId) ?? 0) + 1)
  const release = () => open.set(userId, Math.max(0, (open.get(userId) ?? 1) - 1))

  return sseResponse(
    async (send, signal) => {
      try {
        if (!configured && buildId) {
          send('warn', { message: "Les journaux en direct sont indisponibles : le service de déploiement n'est pas configuré sur cette plateforme." })
        }
        await streamDeploymentLogs({
          client: {
            getDeployment: async (deploymentUuid) => {
              const details = await getDeploymentDetails(deploymentUuid)
              if ('error' in details) throw new Error(details.error)
              return details
            },
          },
          deployment: { status: deployment.status, coolifyBuildId: configured ? buildId : null, logsSummary: deployment.logsSummary },
          // Le worker écrit l'identifiant de build quand il démarre : on le relit tant qu'il manque.
          reload: configured
            ? () => prisma.deployment.findUnique({ where: { id: deploymentId }, select: { status: true, coolifyBuildId: true, logsSummary: true } })
            : undefined,
          secrets,
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
