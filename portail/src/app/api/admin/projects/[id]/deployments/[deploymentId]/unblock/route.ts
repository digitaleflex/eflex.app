import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { announceDeploymentStatus } from '@/lib/deployment-events'
import { cancelDeployment as cancelCoolifyDeployment } from '@/lib/coolify'
import { removeQueuedDeployment } from '@/lib/queue'
import { UNBLOCK_NOTE, unblockDeployment } from '@/lib/admin-projects'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_LOGS = 4_000

const schema = z.object({
  comment: z
    .string()
    .trim()
    .max(300, 'Le commentaire est trop long (300 caractères maximum).')
    .optional(),
})

/**
 * « Débloque » un déploiement actif : retrait du job en file, annulation du
 * build distant au mieux, puis passage en `failed` avec le motif
 * « interrompu par un administrateur ». Le motif est imposé et journalisé.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id, deploymentId } = await params
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      projectId: true,
      status: true,
      coolifyBuildId: true,
      groupId: true,
      appId: true,
      app: { select: { name: true } },
      project: { select: { id: true, name: true, organizationId: true } },
    },
  })
  if (!deployment || deployment.projectId !== id) {
    return NextResponse.json({ error: 'Déploiement introuvable pour ce projet.' }, { status: 404 })
  }

  const result = await unblockDeployment(deployment, {
    removeQueuedJob: removeQueuedDeployment,
    cancelCoolify: cancelCoolifyDeployment,
    markFailed: async (targetId, note) => {
      const current = await prisma.deployment.findUnique({
        where: { id: targetId },
        select: { status: true, logsSummary: true },
      })
      if (!current || ['live', 'failed', 'cancelled'].includes(current.status)) return false
      const updated = await prisma.deployment.updateMany({
        where: { id: targetId, status: current.status },
        data: {
          status: 'failed',
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
    status: 'failed',
    groupId: deployment.groupId,
    appId: deployment.appId,
    appName: deployment.app?.name ?? null,
  })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'deployment.unblock',
    target: { type: 'deployment', id: deployment.id },
    organizationId: deployment.project.organizationId,
    details: {
      projectId: deployment.project.id,
      previousStatus: deployment.status,
      reason: UNBLOCK_NOTE,
      comment: parsed.data.comment ?? null,
      warning: result.warning ?? null,
    },
    request,
  })

  return NextResponse.json({
    ok: true,
    status: 'failed',
    ...(result.warning ? { warning: result.warning } : {}),
  })
}
