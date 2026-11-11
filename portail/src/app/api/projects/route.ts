import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { BuildPlan } from '@eflex/detector'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { allow } from '@/lib/rate-limit'
import { analyzeGitHubRepo, type RepoAnalysis } from '@/lib/repo-analysis'
import { errorResponse, normalizeRoot, repoFields, resolveRepo } from '@/lib/analysis-request'
import { resolveUserRepoToken } from '@/lib/git-credentials'
import { assertCryptoConfig, encrypt } from '@/lib/crypto'
import { buildProjectArtifacts, effectiveBuildPack } from '@/lib/deploy-plan'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { projectDomain, uniqueSlug } from '@/lib/project-slug'
import {
  appDomain,
  appNameFromRoot,
  getPrimaryApp,
  normalizeAppRoot,
  uniqueAppName,
} from '@/lib/project-apps'
import { MAX_PROJECT_APPS, MULTI_APP_DISABLED_MESSAGE, MULTI_APP_LIMIT_MESSAGE, multiAppEnabled } from '@/lib/multi-app'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { MAINTENANCE_DEPLOYMENT_MESSAGE, isMaintenanceActive } from '@/lib/platform-settings'
import { assertDeploymentAllowed, assertProjectQuota } from '@/lib/billing'
import { publish } from '@/lib/event-bus'

const appSchema = z.object({
  /** Dossier de l'application ("" ou absent = racine du dépôt). */
  root: z.string().trim().max(200, "Le dossier de l'application est trop long.").optional(),
  /** Stack choisie pour cette application parmi celles détectées. */
  framework: z.string().trim().max(40).optional(),
  /** Application principale : domaine `<slug>.<racine>` et miroir `Project.*`. */
  primary: z.boolean().optional(),
})

const schema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom au projet.').max(60, 'Le nom du projet est trop long (60 caractères maximum).'),
  ...repoFields,
  /** Commit vu par l'utilisateur lors de l'analyse : on re-analyse exactement celui-là. */
  commitSha: z.string().regex(/^[0-9a-f]{40}$/, 'Identifiant de commit invalide.').optional(),
  /** Stack choisie parmi le résultat de l'analyse (plan principal ou alternative). */
  framework: z.string().trim().max(40).optional(),
  /**
   * Applications à déployer (lot C de D2). Absent ou une seule entrée =
   * comportement mono-application, mais une ligne `ProjectApp` est créée.
   * Chaque entrée est re-analysée côté serveur : le client n'envoie jamais de plan.
   */
  apps: z.array(appSchema).max(MAX_PROJECT_APPS, MULTI_APP_LIMIT_MESSAGE).optional(),
  envVars: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Nom de variable invalide : lettres, chiffres et « _ », sans commencer par un chiffre.'),
        value: z.string().max(5_000, 'Une valeur de variable est trop longue.'),
      }),
    )
    .max(100, 'Trop de variables d\'environnement (100 maximum).')
    .default([]),
})

interface SelectedAppInput {
  root: string
  framework?: string | undefined
  primary: boolean
}

interface SelectedApp {
  root: string
  name: string
  framework: string
  runtime: string | null
  port: number
  plan: BuildPlan
  detection: RepoAnalysis['detection']
  primary: boolean
  position: number
  domain: string | null
}

/** Choisit le plan d'une application : framework demandé, sinon proposition du détecteur. */
function choosePlan(
  detection: RepoAnalysis['detection'],
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

/** Réserve un domaine libre pour une application (unicité globale `ProjectApp.domain`). */
async function reserveAppDomain(candidate: string | null): Promise<string | null> {
  if (!candidate) return null
  const [firstLabel, ...rest] = candidate.split('.')
  if (!firstLabel || rest.length === 0) return candidate
  let label = firstLabel
  for (let index = 1; index <= 20; index += 1) {
    const next = `${label}.${rest.join('.')}`
    const takenApp = await prisma.projectApp.findUnique({ where: { domain: next }, select: { id: true } })
    if (!takenApp) return next
    const suffix = `-${index + 1}`
    label = `${firstLabel.slice(0, 63 - suffix.length).replace(/-$/, '')}${suffix}`
  }
  return null
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const userId = session.user.id

  // Multi-tenant : un projet appartient toujours à l'organisation active de la session,
  // et seuls les propriétaires et administrateurs peuvent en créer.
  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 403 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle dans cette organisation ne permet pas de créer des projets.' }, { status: 403 })
  }

  // Maintenance (issue 31) : la création d'un projet déclenche un déploiement,
  // on refuse donc avant toute analyse ou écriture.
  if (await isMaintenanceActive()) {
    return NextResponse.json(
      { error: MAINTENANCE_DEPLOYMENT_MESSAGE, code: 'maintenance' },
      { status: 503 },
    )
  }

  // Facturation : organisation suspendue ou impayé hors grâce. La création
  // déclenche un déploiement ; on refuse avant toute analyse ou écriture.
  const billing = await assertDeploymentAllowed(org.organizationId)
  if (!billing.ok) {
    return NextResponse.json({ error: billing.error, code: billing.code }, { status: billing.status })
  }

  // Échoue clairement si la clé de chiffrement est absente, plutôt qu'au
  // milieu de la création du projet.
  try {
    assertCryptoConfig()
  } catch {
    return NextResponse.json({ error: 'Configuration du serveur incomplète.' }, { status: 500 })
  }

  if (!(await allow(`create:${userId}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Trop de créations en peu de temps. Patientez une minute.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }
  const input = parsed.data

  const keys = input.envVars.map((v) => v.key)
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json({ error: 'Une variable d\'environnement est déclarée deux fois.' }, { status: 400 })
  }

  // 1. Contrat `apps[]` (lot C de D2). Drapeau désactivé : plus d'une
  //    application est refusée explicitement (jamais de troncature silencieuse).
  const requestedApps: SelectedAppInput[] = input.apps?.length
    ? input.apps.map((app) => ({
        root: app.root ?? '',
        framework: app.framework || undefined,
        primary: app.primary === true,
      }))
    : [{ root: input.root ?? '', framework: input.framework || undefined, primary: true }]

  if (requestedApps.length > 1 && !multiAppEnabled()) {
    return NextResponse.json(
      { error: MULTI_APP_DISABLED_MESSAGE, code: 'multi_app_disabled' },
      { status: 403 },
    )
  }

  let normalizedApps: SelectedAppInput[]
  try {
    normalizedApps = requestedApps.map((app) => ({ ...app, root: normalizeRoot(app.root) }))
  } catch (error) {
    return errorResponse(error)
  }
  if (new Set(normalizedApps.map((app) => app.root)).size !== normalizedApps.length) {
    return NextResponse.json(
      { error: 'Deux applications désignent le même dossier du dépôt.' },
      { status: 400 },
    )
  }

  // Quota : l'unité est l'application (lot C). Vérifié avant toute analyse et
  // toute écriture, pour refuser N applications d'un coup.
  const quota = await assertProjectQuota(org.organizationId, normalizedApps.length)
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

  // 2. Chaque application est re-analysée côté serveur, sur le **même commit**
  //    que celui vu par l'utilisateur. Un framework inconnu pour ce dossier
  //    renvoie 409 : jamais de plan fabriqué côté client.
  let repo!: RepoAnalysis['repo']
  let analyzedCommitSha: string | undefined
  const analyzed: Array<{
    root: string
    framework?: string | undefined
    primary: boolean
    plan: BuildPlan
    detection: RepoAnalysis['detection']
    apps: RepoAnalysis['apps']
  }> = []

  let credential: Awaited<ReturnType<typeof resolveUserRepoToken>> = null
  try {
    const { ref } = resolveRepo({ ...input, root: normalizedApps[0]?.root })
    credential = await resolveUserRepoToken(userId, input)
    analyzedCommitSha = input.commitSha

    for (const app of normalizedApps) {
      const analysis = await analyzeGitHubRepo(ref, {
        root: app.root,
        commitSha: analyzedCommitSha,
        token: process.env.GITHUB_TOKEN,
        installationToken: credential?.source === 'app' ? credential.token : undefined,
        userToken: credential?.source === 'pat' ? credential.token : undefined,
      })
      // Le premier appel fixe le commit : les suivants analysent exactement le
      // même état du dépôt, même si un push arrive entre-temps.
      analyzedCommitSha = analysis.repo.commitSha
      repo = analysis.repo

      const choice = choosePlan(analysis.detection, app.framework)
      if (choice.conflict) {
        return NextResponse.json(
          {
            error: `Le dépôt ne correspond plus à l'analyse affichée pour « ${app.root || 'racine'} ». Relancez l'analyse puis réessayez.`,
            code: 'app_framework_changed',
          },
          { status: 409 },
        )
      }
      if (!choice.plan) {
        return NextResponse.json(
          {
            error:
              `Eflex n'a pas pu déterminer comment déployer « ${app.root || 'la racine'} ». ` +
              "Ajoutez un Dockerfile ou un fichier eflex.json dans ce dossier, puis relancez l'analyse.",
          },
          { status: 422 },
        )
      }

      analyzed.push({
        root: app.root,
        framework: app.framework,
        primary: app.primary,
        plan: choice.plan,
        detection: analysis.detection,
        apps: analysis.apps,
      })
    }
  } catch (error) {
    return errorResponse(error)
  }

  // Application principale : première marquée `primary`, sinon la première.
  const primaryIndex = Math.max(0, analyzed.findIndex((app) => app.primary))
  const ordered = [
    analyzed[primaryIndex]!,
    ...analyzed.filter((_, index) => index !== primaryIndex),
  ]

  // 3. Slug et domaines. L'app principale garde `<slug>.<racine>` ; chaque
  //    app secondaire reçoit `<slug>-<app>.<racine>` (un seul label, cf. § 5).
  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(await prisma.project.findUnique({ where: { slug: candidate }, select: { id: true } })),
  )
  const rootDomain = process.env.PORTAL_DOMAIN
  const takenNames: string[] = []
  const selected: SelectedApp[] = []
  for (const [position, app] of ordered.entries()) {
    const primary = position === 0
    const root = normalizeAppRoot(app.plan.root) || app.root
    const name = uniqueAppName(
      app.apps.find((candidate) => candidate.root === app.root)?.name ??
        appNameFromRoot(root, repo.repo),
      takenNames,
    )
    takenNames.push(name)
    const domain = primary
      ? await reserveAppDomain(projectDomain(slug, rootDomain))
      : await reserveAppDomain(appDomain(slug, name, rootDomain))
    selected.push({
      root,
      name,
      framework: app.plan.framework,
      runtime: app.plan.runtime ?? null,
      port: app.plan.port,
      plan: app.plan,
      detection: app.detection,
      primary,
      position,
      domain,
    })
  }

  const primaryApp = selected[0]!
  if (new Set(selected.map((app) => app.root)).size !== selected.length) {
    return NextResponse.json(
      { error: 'Deux applications désignent le même dossier après analyse du dépôt.' },
      { status: 409 },
    )
  }
  let artifacts: ReturnType<typeof buildProjectArtifacts>
  try {
    artifacts = buildProjectArtifacts(primaryApp.plan, slug)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de préparer le déploiement.' },
      { status: 422 },
    )
  }

  // 4. Le projet, ses applications et ses variables, ensemble ou pas du tout.
  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        userId,
        organizationId: org.organizationId,
        name: input.name,
        slug,
        domain: primaryApp.domain,
        repoUrl: repo.url,
        branch: repo.branch,
        repoFullName: `${repo.owner}/${repo.repo}`,
        installationId: input.installationId ?? null,
        repoPrivate: repo.private,
        productionBranch: repo.branch,
        framework: primaryApp.framework,
        runtime: primaryApp.runtime,
        port: primaryApp.port,
        plan: primaryApp.plan as unknown as Prisma.InputJsonValue,
        detection: {
          framework: primaryApp.framework,
          confidence: primaryApp.detection.confidence,
          reasons: primaryApp.detection.reasons,
          warnings: primaryApp.detection.warnings,
          commitSha: repo.commitSha,
          analyzedAt: new Date().toISOString(),
          apps: selected.map((app) => ({
            name: app.name,
            root: app.root,
            framework: app.framework,
            primary: app.primary,
          })),
        },
      },
    })

    const apps = []
    for (const app of selected) {
      apps.push(
        await tx.projectApp.create({
          data: {
            projectId: project.id,
            name: app.name,
            root: app.root,
            position: app.position,
            plan: app.plan as unknown as Prisma.InputJsonValue,
            framework: app.framework,
            runtime: app.runtime,
            port: app.port,
            domain: app.domain,
          },
        }),
      )
    }

    if (input.envVars.length > 0) {
      await tx.envVar.createMany({
        data: input.envVars.map((v) => ({
          projectId: project.id,
          key: v.key,
          // AAD = projectId:key : une valeur chiffrée ne peut pas être
          // déplacée vers une autre variable ou un autre projet.
          value: encrypt(v.value, `${project.id}:${v.key}`),
        })),
      })
    }
    return { project, apps }
  })

  // Temps réel : la liste des projets est annoncée avant les déploiements du
  // lot, pour que les écrans ouverts connaissent le projet dès le premier event.
  await publish({ type: 'project.created', organizationId: org.organizationId, payload: { projectId: created.project.id, name: created.project.name } })

  // 5. Fan-out à l'enfilement (lot C) : une ligne `Deployment` par application,
  //    même `groupId`, un job par app. Le worker garde « 1 job = 1 app ».
  const queued = await enqueueProjectDeployment(created.project, {
    apps: created.apps.map((app) => ({ id: app.id, name: app.name })),
    commitSha: repo.commitSha,
  })

  const warning = 'error' in queued ? queued.error : null
  const deployments = ('deployments' in queued ? queued.deployments : undefined) ?? []
  const groupId = 'groupId' in queued ? (queued.groupId ?? null) : null
  const deploymentByApp = new Map(deployments.map((deployment) => [deployment.appId, deployment]))
  const firstDeployment = deployments[0] ?? null

  const primaryCreated = getPrimaryApp(created.apps)
  return NextResponse.json(
    {
      project: {
        id: created.project.id,
        name: created.project.name,
        slug: created.project.slug,
        domain: primaryCreated?.domain ?? primaryApp.domain,
      },
      apps: created.apps.map((app) => ({
        id: app.id,
        name: app.name,
        root: app.root,
        domain: app.domain,
        deploymentId: deploymentByApp.get(app.id)?.id ?? null,
      })),
      deployment: firstDeployment
        ? { id: firstDeployment.id, status: firstDeployment.status }
        : null,
      deployments,
      groupId,
      plan: {
        framework: primaryApp.plan.framework,
        buildPack: effectiveBuildPack(primaryApp.plan),
        port: artifacts.portsExposes,
        services: artifacts.services,
        postDeploy: artifacts.postDeploy,
      },
      warning,
    },
    { status: 202 },
  )
}

export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ projects: [] })

  const projects = await prisma.project.findMany({
    where: { organizationId: org.organizationId },
    // Le plan et le détail de l'analyse n'ont pas à transiter dans la liste.
    select: {
      id: true,
      name: true,
      slug: true,
      repoUrl: true,
      branch: true,
      createdAt: true,
      updatedAt: true,
      deployments: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true } },
      // Applications du projet (D2) : nom, dossier, domaine et dernier statut.
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          root: true,
          position: true,
          framework: true,
          runtime: true,
          port: true,
          domain: true,
          coolifyAppId: true,
          deployments: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({
    projects: projects.map(({ apps, ...project }) => {
      const primary = getPrimaryApp(apps)
      return {
        ...project,
        framework: primary?.framework ?? null,
        runtime: primary?.runtime ?? null,
        domain: primary?.domain ?? null,
        coolifyAppId: primary?.coolifyAppId ?? null,
        appCount: apps.length,
        apps: apps.map(({ deployments, position, ...app }) => {
          void position
          return {
            ...app,
            lastStatus: deployments[0]?.status ?? null,
            lastDeployedAt: deployments[0]?.createdAt ?? null,
          }
        }),
      }
    }),
  })
}
