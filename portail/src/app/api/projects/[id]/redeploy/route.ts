import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { enqueueDeployment } from '@/lib/queue'

export const dynamic = 'force-dynamic'

/** Relance un déploiement : nouveau Deployment `queued` + job (issue 06). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      deployments: { orderBy: { createdAt: 'desc' }, take: 1, select: { commitSha: true } },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      commitSha: project.deployments[0]?.commitSha || 'pending',
      status: 'queued',
    },
  })

  try {
    await enqueueDeployment(deployment.id)
  } catch (error) {
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'failed', logsSummary: 'File de déploiement indisponible.' },
    })
    return NextResponse.json({ error: 'File de déploiement indisponible.' }, { status: 503 })
  }

  return NextResponse.json(
    { deployment: { id: deployment.id, status: 'queued' } },
    { status: 202 },
  )
}
