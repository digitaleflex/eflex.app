import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { BuildPlan } from '@eflex/detector'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { allow } from '@/lib/rate-limit'
import { analyzeGitHubRepo } from '@/lib/repo-analysis'
import { errorResponse, repoFields, resolveRepo } from '@/lib/analysis-request'
import { resolveUserRepoToken } from '@/lib/git-credentials'
import { assertCryptoConfig, encrypt } from '@/lib/crypto'
import { buildProjectArtifacts } from '@/lib/deploy-plan'
import { enqueueDeployment } from '@/lib/queue'
import { projectDomain, uniqueSlug } from '@/lib/project-slug'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { MAINTENANCE_DEPLOYMENT_MESSAGE, isMaintenanceActive } from '@/lib/platform-settings'
import { assertDeploymentAllowed, assertProjectQuota } from '@/lib/billing'
import { publish } from '@/lib/event-bus'

const schema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom au projet.').max(60, 'Le nom du projet est trop long (60 caractères maximum).'),
  ...repoFields,
  /** Commit vu par l'utilisateur lors de l'analyse : on re-analyse exactement celui-là. */
  commitSha: z.string().regex(/^[0-9a-f]{40}$/, 'Identifiant de commit invalide.').optional(),
  /** Stack choisie parmi le résultat de l'analyse (plan principal ou alternative). */
  framework: z.string().trim().max(40).optional(),
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

  const quota = await assertProjectQuota(org.organizationId)
  if ('error' in quota) {
    return NextResponse.json({ error: quota.error, code: 'plan_limit', plan: quota.plan.id }, { status: 403 })
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

  // 1. Le plan vient du serveur, jamais du client : il pilote des commandes exécutées sur
  //    l'infrastructure. On refait l'analyse du commit que l'utilisateur a vu.
  let analysis
  try {
    const { ref, root } = resolveRepo(input)
    const credential = await resolveUserRepoToken(userId, input)
    analysis = await analyzeGitHubRepo(ref, {
      root,
      commitSha: input.commitSha,
      token: process.env.GITHUB_TOKEN,
      installationToken: credential?.source === 'app' ? credential.token : undefined,
      userToken: credential?.source === 'pat' ? credential.token : undefined,
    })
  } catch (error) {
    return errorResponse(error)
  }

  const { detection, repo } = analysis
  const candidates = [detection.plan, ...detection.alternatives].filter((p): p is BuildPlan => p !== null)
  let plan: BuildPlan | undefined
  if (input.framework) {
    plan = candidates.find((p) => p.framework === input.framework)
    if (!plan) {
      return NextResponse.json(
        { error: "Le dépôt ne correspond plus à l'analyse affichée. Relancez l'analyse puis réessayez." },
        { status: 409 },
      )
    }
  } else {
    plan = detection.plan ?? undefined
  }
  if (!plan) {
    return NextResponse.json(
      {
        error:
          "Eflex n'a pas pu déterminer comment déployer ce dépôt. Ajoutez un Dockerfile ou un fichier eflex.json à sa racine, puis relancez l'analyse.",
      },
      { status: 422 },
    )
  }

  // 2. Le BuildPlan devient la source de vérité du déploiement (issue 02) :
  //    Dockerfile, compose, port réel, services et commandes post-déploiement.
  //    Plus aucune détection Nixpacks : Eflex garde la main.
  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(await prisma.project.findUnique({ where: { slug: candidate }, select: { id: true } })),
  )
  // Chaque projet reçoit un sous-domaine public (DNS wildcard *.eflex.app) :
  // le worker génère les labels Traefik et Coolify route l'application.
  const domain = projectDomain(slug, process.env.PORTAL_DOMAIN)
  let artifacts: ReturnType<typeof buildProjectArtifacts>
  try {
    artifacts = buildProjectArtifacts(plan, slug)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de préparer le déploiement.' },
      { status: 422 },
    )
  }

  // 3. Le projet et ses variables, ensemble ou pas du tout.
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        userId,
        organizationId: org.organizationId,
        name: input.name,
        slug,
        domain,
        repoUrl: repo.url,
        branch: repo.branch,
        repoFullName: `${repo.owner}/${repo.repo}`,
        installationId: input.installationId ?? null,
        repoPrivate: repo.private,
        productionBranch: repo.branch,
        framework: plan.framework,
        runtime: plan.runtime,
        port: plan.port,
        plan: plan as unknown as Prisma.InputJsonValue,
        detection: {
          framework: plan.framework,
          confidence: detection.confidence,
          reasons: detection.reasons,
          warnings: detection.warnings,
          commitSha: repo.commitSha,
          analyzedAt: new Date().toISOString(),
        },
      },
    })
    if (input.envVars.length > 0) {
      await tx.envVar.createMany({
        data: input.envVars.map((v) => ({
          projectId: created.id,
          key: v.key,
          // AAD = projectId:key : une valeur chiffrée ne peut pas être
          // déplacée vers une autre variable ou un autre projet.
          value: encrypt(v.value, `${created.id}:${v.key}`),
        })),
      })
    }
    return created
  })

  // 4. Le déploiement est asynchrone (issue 06) : on crée un Deployment
  //    `queued`, on l'enfile et on répond immédiatement. Le worker prend le
  //    relais (Coolify, variables, build, statut, logs).
  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      commitSha: repo.commitSha,
      status: 'queued',
    },
  })

  let warning: string | null = null
  try {
    await enqueueDeployment(deployment.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File indisponible.'
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'failed', logsSummary: `Déploiement non enfilé : ${message}` },
    })
    warning = `Déploiement en échec : ${message}`
  }

  // Temps réel : les listes ouvertes (accueil, activité) se mettent à jour sans rechargement.
  await publish({ type: 'project.created', organizationId: org.organizationId, payload: { projectId: project.id, name: project.name } })
  await publish({
    type: 'deployment.created',
    organizationId: org.organizationId,
    payload: { projectId: project.id, deploymentId: deployment.id, status: warning ? 'failed' : 'queued', name: project.name },
  })

  return NextResponse.json(
    {
      project: { id: project.id, name: project.name, slug: project.slug, domain: project.domain },
      deployment: { id: deployment.id, status: warning ? 'failed' : 'queued' },
      plan: {
        framework: plan.framework,
        buildPack: artifacts.buildPack,
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
      framework: true,
      runtime: true,
      domain: true,
      coolifyAppId: true,
      createdAt: true,
      updatedAt: true,
      deployments: { take: 1, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ projects })
}
