import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { enqueueProjectDeployment } from '@/lib/project-deployments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Retire un domaine personnalisé et reprogramme un déploiement pour les labels. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; domainId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de retirer ce domaine.' }, { status: 403 })
  }

  const { id, domainId } = await params
  const domain = await prisma.projectDomain.findFirst({
    where: { id: domainId, projectId: id, project: { organizationId: org.organizationId } },
    select: {
      id: true,
      project: { select: { id: true, name: true, organizationId: true, coolifyAppId: true } },
    },
  })
  if (!domain) return NextResponse.json({ error: 'Domaine introuvable.' }, { status: 404 })

  await prisma.projectDomain.delete({ where: { id: domain.id } })

  let deploymentId: string | null = null
  if (domain.project.coolifyAppId) {
    const queued = await enqueueProjectDeployment(domain.project)
    if (!('error' in queued)) deploymentId = queued.deploymentId
  }

  return NextResponse.json({
    ok: true,
    deploymentId,
    message: deploymentId
      ? 'Domaine retiré. Un déploiement met à jour la configuration.'
      : 'Domaine retiré.',
  })
}
