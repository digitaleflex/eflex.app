import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { multiAppEnabled } from '@/lib/multi-app'
import { allow } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Relance un déploiement : une ligne `Deployment` par application (même
 * `groupId`) ou une seule avec `?appId=`.
 *
 * Drapeau `EFLEX_MULTI_APP` désactivé : déploiement de portée projet, comme
 * avant le lot C (le worker lit alors les colonnes `Project.*`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  if (!(await allow(`redeploy:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de redéploiements en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params
  const url = new URL(request.url)
  const appId = url.searchParams.get('appId')
  // Le projet doit appartenir à l'organisation active, et le rôle doit permettre de déployer.
  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle dans cette organisation ne permet pas de relancer un déploiement.' }, { status: 403 })
  }
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const multi = multiAppEnabled()
  const apps = appId
    ? project.apps.filter((app) => app.id === appId)
    : multi
      ? project.apps
      : []
  if (appId && apps.length === 0) {
    return NextResponse.json(
      { error: 'Application introuvable dans ce projet.', code: 'app_not_found' },
      { status: 404 },
    )
  }

  const queued = await enqueueProjectDeployment(project, {
    exclusive: true,
    apps: apps.map((app) => ({ id: app.id, name: app.name })),
  })
  if ('error' in queued) {
    // Un déploiement tourne déjà : message explicite plutôt qu'une file qui
    // écraserait le build en cours. La facturation renvoie 402/403 pour que le
    // client distingue un blocage d'abonnement d'une panne de file.
    const status =
      queued.code === 'deployment_in_progress'
        ? 409
        : queued.status ?? (queued.code === 'organization_suspended' ? 403 : queued.code === 'payment_past_due' ? 402 : 503)
    return NextResponse.json(
      {
        error: queued.error,
        ...(queued.code ? { code: queued.code } : {}),
        ...(queued.activeDeploymentId ? { deploymentId: queued.activeDeploymentId } : {}),
        ...(queued.deployments ? { deployments: queued.deployments } : {}),
      },
      { status },
    )
  }

  return NextResponse.json(
    {
      deployment: { id: queued.deploymentId, status: 'queued' },
      deployments: queued.deployments,
      groupId: queued.groupId,
      skipped: queued.skipped,
    },
    { status: 202 },
  )
}
