import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects } from '@/lib/organizations'
import { allow, allowOrg } from '@/lib/rate-limit'
import { cancelDeployment as cancelCoolifyDeployment } from '@/lib/coolify'
import { removeQueuedDeployment } from '@/lib/queue'
import { isTerminal } from '@/lib/deployment-state'
import { cancelDeployment } from '@/lib/deployment-cancel'
import { announceDeploymentStatus } from '@/lib/deployment-events'
import { requireDeployment, requireOrg, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_LOGS = 4_000

/**
 * Annule un déploiement (issue 04).
 *
 * - `queued` : le job BullMQ est retiré, le worker ne le traitera jamais ;
 * - en cours : annulation demandée à Coolify, puis état local `cancelled` ;
 * - un échec Coolify n'empêche pas l'annulation locale (avertissement renvoyé).
 *
 * Le worker vérifie l'état avant chaque étape et n'écrase jamais `cancelled`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; deploymentId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas d’annuler un déploiement.' },
      { status: 403 },
    )
  }

  if (!(await allow(`cancel-deployment:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json(
      { error: 'Trop d’annulations en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }
  if (!(await allowOrg(org.organizationId, 'deployment-cancel', 30, 60_000))) {
    return NextResponse.json(
      { error: 'Trop d’annulations pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id, deploymentId } = await params
  const deploymentResult = await requireDeployment(org, id, deploymentId, {
    id: true,
    status: true,
    coolifyBuildId: true,
    groupId: true,
    appId: true,
    app: { select: { name: true } },
    project: { select: { id: true, name: true, organizationId: true } },
  })
  if ('response' in deploymentResult) return deploymentResult.response
  const deployment = deploymentResult.deployment as {
    id: string
    status: string
    coolifyBuildId: string | null
    groupId: string | null
    appId: string | null
    app: { name: string } | null
    project: { id: string; name: string; organizationId: string }
    logsSummary: string | null
  }

  const result = await cancelDeployment(deployment, {
    removeQueuedJob: removeQueuedDeployment,
    cancelCoolify: cancelCoolifyDeployment,
    markCancelled: async (targetId, note) => {
      const current = await prisma.deployment.findUnique({
        where: { id: targetId },
        select: { status: true, logsSummary: true },
      })
      if (!current || isTerminal(current.status)) return false
      // Mise à jour conditionnelle : une transition concurrente (live/failed/
      // cancelled) gagne toujours, on n'écrase jamais un état terminal.
      const updated = await prisma.deployment.updateMany({
        where: { id: targetId, status: { notIn: ['live', 'failed', 'cancelled'] } },
        data: {
          status: 'cancelled',
          logsSummary: [current.logsSummary, note]
            .filter((line): line is string => Boolean(line))
            .join('\n')
            .slice(-MAX_LOGS),
        },
      })
      return updated.count === 1
    },
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, ...(result.warning ? { warning: result.warning } : {}) },
      { status: 409 },
    )
  }

  await announceDeploymentStatus({
    organizationId: deployment.project.organizationId,
    projectId: deployment.project.id,
    projectName: deployment.project.name,
    deploymentId: deployment.id,
    status: 'cancelled',
    groupId: deployment.groupId,
    appId: deployment.appId,
    appName: deployment.app?.name ?? null,
  })

  return NextResponse.json({
    ok: true,
    status: 'cancelled',
    ...(result.warning ? { warning: result.warning } : {}),
  })
}
