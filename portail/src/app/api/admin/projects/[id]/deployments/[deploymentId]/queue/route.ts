import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { getDeploymentQueueDiagnostics } from '@/lib/queue'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Diagnostic BullMQ d'un déploiement : état du job, tentatives, raison d'échec,
 * horodatages. Permet de distinguer un déploiement bloqué en base d'un job
 * absent, actif, différé ou en échec dans la file.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; deploymentId: string }> },
) {
  const guard = await requireAdminApi('admin.deployments.read')
  if ('response' in guard) return guard.response

  const { id, deploymentId } = await params
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: { id: true, projectId: true, status: true, createdAt: true },
  })
  if (!deployment || deployment.projectId !== id) {
    return NextResponse.json({ error: 'Déploiement introuvable pour ce projet.' }, { status: 404 })
  }

  const queue = await getDeploymentQueueDiagnostics(deploymentId)
  return NextResponse.json({
    deployment: {
      id: deployment.id,
      status: deployment.status,
      createdAt: deployment.createdAt.toISOString(),
    },
    queue,
  })
}
