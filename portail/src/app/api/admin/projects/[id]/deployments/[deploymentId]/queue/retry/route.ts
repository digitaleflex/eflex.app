import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { announceDeploymentStatus } from '@/lib/deployment-events'
import { getDeploymentQueueDiagnostics, recoverDeploymentQueueJob } from '@/lib/queue'
import { isTerminal } from '@/lib/deployment-state'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  comment: z.string().trim().max(300).optional(),
})

/**
 * Relance sûre du job BullMQ d'un déploiement non terminal (admin).
 * Utilisé quand le job est manquant, en échec BullMQ ou dans un état résiduel.
 * N'écrase pas un déploiement terminal et n'agit pas sur un job déjà actif/en attente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; deploymentId: string }> },
) {
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
      groupId: true,
      appId: true,
      app: { select: { name: true } },
      project: { select: { id: true, name: true, organizationId: true } },
    },
  })
  if (!deployment || deployment.projectId !== id) {
    return NextResponse.json({ error: 'Déploiement introuvable pour ce projet.' }, { status: 404 })
  }

  if (isTerminal(deployment.status)) {
    return NextResponse.json(
      { error: 'Ce déploiement est déjà terminé : le job ne peut pas être relancé.' },
      { status: 409 },
    )
  }

  const before = await getDeploymentQueueDiagnostics(deploymentId)
  const result = await recoverDeploymentQueueJob(deploymentId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 })
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'deployment.queue.retry',
    target: { type: 'deployment', id: deployment.id },
    organizationId: deployment.project.organizationId,
    details: {
      projectId: deployment.project.id,
      status: deployment.status,
      queueStateBefore: before?.state ?? null,
      queueState: result.state,
      action: result.action,
      comment: parsed.data.comment ?? null,
    },
    request,
  })

  // Signal temps réel léger pour rafraîchir les consoles ; l'état métier peut rester inchangé.
  await announceDeploymentStatus({
    organizationId: deployment.project.organizationId,
    projectId: deployment.project.id,
    projectName: deployment.project.name,
    deploymentId: deployment.id,
    status: deployment.status,
    groupId: deployment.groupId,
    appId: deployment.appId,
    appName: deployment.app?.name ?? null,
  }).catch(() => undefined)

  const message =
    result.action === 'noop'
      ? 'Le job est déjà pris en charge par la file (aucune action nécessaire).'
      : result.action === 'retried'
        ? 'Job BullMQ relancé.'
        : 'Job ré-enfilé dans la file de déploiement.'

  return NextResponse.json({
    ok: true,
    action: result.action,
    queueState: result.state,
    message,
  })
}