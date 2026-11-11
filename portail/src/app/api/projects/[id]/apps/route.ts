import { NextResponse } from 'next/server'
import type { BuildPlan } from '@eflex/detector'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { analyzeGitHubRepo } from '@/lib/repo-analysis'
import { errorResponse, normalizeRoot } from '@/lib/analysis-request'
import { parseGitHubUrl } from '@/lib/github-url'
import { buildProjectArtifacts } from '@/lib/deploy-plan'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { assertCryptoConfig } from '@/lib/crypto'
import { publish } from '@/lib/event-bus'
import { multiAppEnabled, MULTI_APP_DISABLED_MESSAGE } from '@/lib/multi-app'
import { MAINTENANCE_DEPLOYMENT_MESSAGE, isMaintenanceActive } from '@/lib/platform-settings'
import { assertDeploymentAllowed, assertProjectQuota } from '@/lib/billing'
import { resolveProjectToken } from '@/lib/git-credentials'
import { appDomain, appNameFromRoot, normalizeAppRoot, uniqueAppName } from '@/lib/project-apps'

export const dynamic = 'force-dynamic'

/** Domaine libre pour une application (unicité globale `ProjectApp.domain` et `Project.domain`). */
async function reserveAppDomain(candidate: string | null): Promise<string | null> {
  if (!candidate) return null
  const [firstLabel, ...rest] = candidate.split('.')
  if (!firstLabel || rest.length === 0) return candidate
  let label = firstLabel
  for (let index = 1; index <= 20; index += 1) {
    const next = `${label}.${rest.join('.')}`
    const takenApp = await prisma.projectApp.findUnique({ where: { domain: next }, select: { id: true } })
    const takenProject = takenApp
      ? null
      : await prisma.project.findFirst({ where: { domain: next }, select: { id: true } })
    if (!takenApp && !takenProject) return next
    const suffix = `-${index + 1}`
    label = `${firstLabel.slice(0, 63 - suffix.length).replace(/-$/, '')}${suffix}`
  }
  return null
}

function choosePlan(
  detection: { plan: BuildPlan | null; alternatives: BuildPlan[] },
  framework: string | undefined,
): { plan?: BuildPlan; conflict?: true } {
  const candidates = [detection.plan, ...detection.alternatives].filter(
    (plan): plan is BuildPlan => plan !== null,
  )
  if (framework) {
    const match = candidates.find((plan) => plan.framework === framework)
    return match ? { plan: match } : { conflict: true }
  }
  return detection.plan ? { plan: detection.plan } : {}
}

/**
 * Liste les applications du projet (ordre position, nom) avec le dernier déploiement.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const apps = await prisma.projectApp.findMany({
    where: { projectId: project.id },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      root: true,
      framework: true,
      runtime: true,
      port: true,
      domain: true,
      coolifyAppId: true,
      position: true,
      deployments: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { status: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({
    apps: apps.map(({ deployments, ...app }) => ({
      ...app,
      lastDeployment: deployments[0]
        ? { status: deployments[0].status, createdAt: deployments[0].createdAt.toISOString() }
        : null,
    })),
  })
}

/**
 * Ajoute une application à un projet existant : ré-analyse le dépôt à la branche
 * du projet, crée l'application puis enfile son déploiement.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de modifier ce projet.' },
      { status: 403 },
    )
  }

  if (!multiAppEnabled()) {
    return NextResponse.json({ error: MULTI_APP_DISABLED_MESSAGE, code: 'multi_app_disabled' }, { status: 403 })
  }

  if (await isMaintenanceActive()) {
    return NextResponse.json(
      { error: MAINTENANCE_DEPLOYMENT_MESSAGE, code: 'maintenance' },
      { status: 503 },
    )
  }

  const billing = await assertDeploymentAllowed(org.organizationId)
  if (!billing.ok) {
    return NextResponse.json({ error: billing.error, code: billing.code }, { status: billing.status })
  }

  try {
    assertCryptoConfig()
  } catch {
    return NextResponse.json({ error: 'Configuration du serveur incomplète.' }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const input = (body && typeof body === 'object' ? body : {}) as { root?: unknown; framework?: unknown }
  let root: string
  try {
    root = normalizeRoot(typeof input.root === 'string' ? input.root : '')
  } catch (error) {
    return errorResponse(error)
  }
  const framework = typeof input.framework === 'string' && input.framework.trim() ? input.framework.trim() : undefined

  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      userId: true,
      organizationId: true,
      repoUrl: true,
      repoFullName: true,
      installationId: true,
      branch: true,
      apps: { select: { id: true, name: true, root: true, position: true } },
    },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  if (project.apps.some((app) => app.root === root)) {
    return NextResponse.json(
      { error: 'Une application existe déjà pour ce dossier dans ce projet.' },
      { status: 409 },
    )
  }

  const quota = await assertProjectQuota(org.organizationId, 1)
  if ('error' in quota) {
    return NextResponse.json(
      {
        error: quota.error,
        code: 'plan_limit',
        plan: quota.plan.id,
        required: quota.required,
        limit: quota.limit,
        used: quota.used,
      },
      { status: 403 },
    )
  }

  try {
    const refFromUrl = parseGitHubUrl(project.repoUrl)
    const [fullOwner, fullRepo] = project.repoFullName?.split('/') ?? []
    const owner = fullOwner || refFromUrl?.owner
    const repo = fullRepo || refFromUrl?.repo
    if (!owner || !repo) {
      return NextResponse.json({ error: 'Dépôt du projet introuvable.' }, { status: 422 })
    }

    const token = await resolveProjectToken({ userId: project.userId, installationId: project.installationId })
    const analysis = await analyzeGitHubRepo(
      { owner, repo, branch: project.branch || null },
      {
        root,
        token: process.env.GITHUB_TOKEN,
        installationToken: project.installationId ? token ?? undefined : undefined,
        userToken: !project.installationId ? token ?? undefined : undefined,
      },
    )

    const choice = choosePlan(analysis.detection, framework)
    if (choice.conflict) {
      return NextResponse.json(
        { error: `Le dépôt ne correspond plus à l'analyse pour « ${root || 'la racine'} ». Relancez l'analyse puis réessayez.`, code: 'app_framework_changed' },
        { status: 409 },
      )
    }
    if (!choice.plan) {
      return NextResponse.json(
        {
          error:
            `Eflex n'a pas pu déterminer comment déployer « ${root || 'la racine'} ». ` +
            "Ajoutez un Dockerfile ou un fichier eflex.json dans ce dossier, puis relancez l'analyse.",
        },
        { status: 422 },
      )
    }

    const normalizedRoot = normalizeAppRoot(choice.plan.root) || root
    if (project.apps.some((app) => app.root === normalizedRoot)) {
      return NextResponse.json(
        { error: 'Une application existe déjà pour ce dossier dans ce projet.' },
        { status: 409 },
      )
    }

    const detectedName = analysis.apps.find((candidate) => candidate.root === root)?.name
    const name = uniqueAppName(
      detectedName ?? appNameFromRoot(normalizedRoot, repo),
      project.apps.map((app) => app.name),
    )
    const maxPosition = project.apps.reduce((max, app) => Math.max(max, app.position), -1)
    const domain = await reserveAppDomain(appDomain(project.slug, name, process.env.PORTAL_DOMAIN))

    // Valide que le plan peut être préparé (cohérent avec la création de projet).
    buildProjectArtifacts(choice.plan, `${project.slug}-${name}`)

    const created = await prisma.projectApp.create({
      data: {
        projectId: project.id,
        name,
        root: normalizedRoot,
        position: maxPosition + 1,
        plan: choice.plan as unknown as Prisma.InputJsonValue,
        framework: choice.plan.framework,
        runtime: choice.plan.runtime ?? null,
        port: choice.plan.port,
        domain,
      },
    })

    await publish({
      type: 'project.updated',
      organizationId: org.organizationId,
      payload: { projectId: project.id, name: project.name },
    })

    const queued = await enqueueProjectDeployment(project, {
      apps: [{ id: created.id, name: created.name }],
      commitSha: analysis.repo.commitSha,
    })

    if ('error' in queued) {
      const status = queued.code === 'deployment_in_progress' ? 409 : queued.status ?? 503
      return NextResponse.json(
        {
          app: { id: created.id, name: created.name, root: created.root, domain: created.domain },
          error: queued.error,
          ...(queued.code ? { code: queued.code } : {}),
          ...(queued.activeDeploymentId ? { deploymentId: queued.activeDeploymentId } : {}),
        },
        { status },
      )
    }

    return NextResponse.json(
      {
        app: {
          id: created.id,
          name: created.name,
          root: created.root,
          framework: created.framework,
          runtime: created.runtime,
          port: created.port,
          domain: created.domain,
          coolifyAppId: created.coolifyAppId,
          position: created.position,
        },
        deployment: { id: queued.deploymentId, status: 'queued' },
        deployments: queued.deployments,
        groupId: queued.groupId,
      },
      { status: 202 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
