import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { announceDeploymentStatus } from '@/lib/deployment-events'
import { CANCEL_NOTE, cancelDeployment } from '@/lib/deployment-cancel'
import { cancelDeployment as cancelCoolifyDeployment } from '@/lib/coolify'
import { removeQueuedDeployment } from '@/lib/queue'
import { REASON_MAX, REASON_MIN } from '@/lib/admin-projects'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_LOGS = 4_000

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(REASON_MIN, `Indiquez un motif (${REASON_MIN} caractères minimum).`)
    .max(REASON_MAX, 'Le motif est trop long (300 caractères maximum).'),
})

/**
 * Annule un déploiement depuis l'administration. Même enchaînement que la route
 * client (`lib/deployment-cancel`) : retrait du job en file, annulation Coolify
 * au mieux, puis état local `cancelled` — jamais d'écrasement d'un état terminal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id, deploymentId } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
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
      project: { select: { id: true, name: true, organizationId: true } },
    },
  })
  if (!deployment || deployment.projectId !== id) {
    return NextResponse.json({ error: 'Déploiement introuvable pour ce projet.' }, { status: 404 })
  }

  const result = await cancelDeployment(deployment, {
    removeQueuedJob: removeQueuedDeployment,
    cancelCoolify: cancelCoolifyDeployment,
    markCancelled: async (targetId, note) => {
      const current = await prisma.deployment.findUnique({
        where: { id: targetId },
        select: { status: true, logsSummary: true },
      })
      if (!current || ['live', 'failed', 'cancelled'].includes(current.status)) return false
      const adminNote = `${note} Motif indiqué par l’administrateur : ${parsed.data.reason}`
      const updated = await prisma.deployment.updateMany({
        where: { id: targetId, status: { notIn: ['live', 'failed', 'cancelled'] } },
        data: {
          status: 'cancelled',
          logsSummary: [current.logsSummary, adminNote]
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
  })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'deployment.cancel',
    target: { type: 'deployment', id: deployment.id },
    organizationId: deployment.project.organizationId,
    details: {
      projectId: deployment.project.id,
      reason: parsed.data.reason,
      previousStatus: deployment.status,
      note: CANCEL_NOTE,
      warning: result.warning ?? null,
    },
    request,
  })

  return NextResponse.json({
    ok: true,
    status: 'cancelled',
    ...(result.warning ? { warning: result.warning } : {}),
  })
}
