import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { isAppDeployed } from '@/lib/project-primary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Retire un domaine personnalisé et reprogramme un déploiement pour les labels. */
export async function DELETE(
  request: Request,
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
      hostname: true,
      appId: true,
      app: { select: { id: true, name: true, coolifyAppId: true } },
      project: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          coolifyAppId: true,
          apps: { select: { id: true, name: true, coolifyAppId: true } },
        },
      },
    },
  })
  if (!domain) return NextResponse.json({ error: 'Domaine introuvable.' }, { status: 404 })

  await prisma.projectDomain.delete({ where: { id: domain.id } })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.domain.delete',
    target: { type: 'project_domain', id: domain.id },
    organizationId: org.organizationId,
    details: { projectId: id, hostname: domain.hostname, appId: domain.appId },
    request,
  })

  let deploymentId: string | null = null
  const shouldEnqueue = domain.app
    ? Boolean(domain.app.coolifyAppId)
    : isAppDeployed(domain.project)
  if (shouldEnqueue) {
    const queued = await enqueueProjectDeployment(domain.project, {
      apps: domain.app ? [{ id: domain.app.id, name: domain.app.name }] : undefined,
    })
    if (!('error' in queued)) deploymentId = queued.deploymentId ?? queued.deployments?.[0]?.id ?? null
  }

  return NextResponse.json({
    ok: true,
    deploymentId,
    message: deploymentId
      ? 'Domaine retiré. Un déploiement met à jour la configuration.'
      : 'Domaine retiré.',
  })
}
