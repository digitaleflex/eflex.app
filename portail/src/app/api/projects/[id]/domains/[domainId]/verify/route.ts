import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { checkDomainDns } from '@/lib/custom-domain'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { isAppDeployed } from '@/lib/project-primary'
import { allowOrg } from '@/lib/rate-limit'
import { requireOrg, requireProjectDomain, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Vérifie le DNS puis programme un déploiement pour appliquer les labels/SSL. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; domainId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de vérifier ce domaine.' }, { status: 403 })
  }

  if (!(await allowOrg(org.organizationId, 'domain-mutate', 20, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications de domaines pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
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

  const dns = await checkDomainDns(domain.hostname)
  if (!dns.ok) {
    return NextResponse.json(
      { error: dns.error ?? 'Le domaine ne pointe pas encore vers la plateforme.', dns },
      { status: 422 },
    )
  }

  await prisma.projectDomain.update({
    where: { id: domain.id },
    data: { verifiedAt: new Date() },
  })

  let deploymentId: string | null = null
  const shouldEnqueue = domain.app
    ? Boolean(domain.app.coolifyAppId)
    : isAppDeployed(domain.project)
  if (shouldEnqueue) {
    const queued = await enqueueProjectDeployment(domain.project, {
      apps: domain.app ? [{ id: domain.app.id, name: domain.app.name }] : undefined,
    })
    if ('error' in queued) {
      return NextResponse.json(
        { error: `DNS vérifié, mais le déploiement n’a pas pu démarrer : ${queued.error}` },
        { status: 503 },
      )
    }
    deploymentId = queued.deploymentId ?? queued.deployments?.[0]?.id ?? null
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.domain.verify',
    target: { type: 'project_domain', id: domain.id },
    organizationId: org.organizationId,
    details: { projectId: id, hostname: domain.hostname, appId: domain.appId, deploymentId },
    request,
  })

  return NextResponse.json({
    ok: true,
    dns,
    deploymentId,
    message: deploymentId
      ? 'DNS vérifié. Un déploiement applique le domaine et prépare le certificat.'
      : 'DNS vérifié. Le domaine sera actif au premier déploiement.',
  })
}
