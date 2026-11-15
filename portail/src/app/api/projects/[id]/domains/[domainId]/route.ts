import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { isAppDeployed } from '@/lib/project-primary'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { requireOrg, requireProjectDomain, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Retire un domaine personnalisé et reprogramme un déploiement pour les labels. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; domainId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de retirer ce domaine.' }, { status: 403 })
  }

  const mutateLimit = await checkOrg(org.organizationId, 'domain-mutate', 20, 60_000)
  if (!mutateLimit.allowed) {
    return rateLimitedResponse(
      mutateLimit,
      'Trop de modifications de domaines pour cette organisation en peu de temps. Patientez une minute.',
    )
  }

  const { id, domainId } = await params
  const domainResult = await requireProjectDomain(org, id, domainId, {
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
  })
  if ('response' in domainResult) return domainResult.response
  const domain = domainResult.domain as unknown as {
    id: string
    hostname: string
    appId: string | null
    app: { id: string; name: string; coolifyAppId: string | null } | null
    project: {
      id: string
      name: string
      organizationId: string
      coolifyAppId: string | null
      apps: Array<{ id: string; name: string; coolifyAppId: string | null }>
    }
  }

  const deleted = await prisma.projectDomain.deleteMany({ where: { id: domain.id, projectId: id } })
  if (deleted.count === 0) return tenantNotFound('Domaine introuvable.')

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
