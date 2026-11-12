import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { multiAppEnabled } from '@/lib/multi-app'
import { allow, allowOrg } from '@/lib/rate-limit'
import { getPrimaryApp } from '@/lib/project-primary'
import { assertProjectManager, requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

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
  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  const denied = assertProjectManager(org)
  if (denied) {
    return NextResponse.json({ error: 'Votre rôle dans cette organisation ne permet pas de relancer un déploiement.' }, { status: 403 })
  }
  if (!(await allowOrg(org.organizationId, 'redeploy', 30, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de redéploiements pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }
  const projectResult = await requireProject(org, id, {
    id: true,
    name: true,
    organizationId: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, coolifyAppId: true },
    },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  const multi = multiAppEnabled()
  let apps = project.apps
  if (appId) {
    apps = project.apps.filter((app) => app.id === appId)
    if (apps.length === 0) {
      return NextResponse.json(
        { error: 'Application introuvable dans ce projet.', code: 'app_not_found' },
        { status: 404 },
      )
    }
  } else if (!multi && project.apps.length > 0) {
    // Mono-app / drapeau désactivé : cibler l’app principale ou déjà déployée
    // (source ProjectApp), jamais un déploiement de portée projet basé sur les miroirs.
    const target = project.apps.find((app) => app.coolifyAppId) ?? getPrimaryApp(project.apps)
    apps = target ? [target] : []
  } else if (!multi) {
    // Aucune application connue : repli historique de portée projet.
    apps = []
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
