import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { BuildPlan } from '@eflex/detector'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { allow } from '@/lib/rate-limit'
import { analyzeGitHubRepo } from '@/lib/repo-analysis'
import { errorResponse, repoFields, resolveRepo } from '@/lib/analysis-request'
import { assertCryptoConfig, encrypt } from '@/lib/crypto'
import { buildProjectArtifacts } from '@/lib/deploy-plan'
import { enqueueDeployment } from '@/lib/queue'

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

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
  return slug || 'projet'
}

/** Slug unique : le nom seul si libre, sinon suffixé (le slug est unique pour toute la plateforme). */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name)
  let candidate = base
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const taken = await prisma.project.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!taken) return candidate
    candidate = `${base}-${randomBytes(2).toString('hex')}`
  }
  return `${base}-${randomBytes(4).toString('hex')}`
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const userId = session.user.id

  // Échoue clairement si la clé de chiffrement est absente, plutôt qu'au
  // milieu de la création du projet.
  try {
    assertCryptoConfig()
  } catch {
    return NextResponse.json({ error: 'Configuration du serveur incomplète.' }, { status: 500 })
  }

  if (!allow(`create:${userId}`, 10, 60_000)) {
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
    analysis = await analyzeGitHubRepo(ref, { root, commitSha: input.commitSha, token: process.env.GITHUB_TOKEN })
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
  const slug = await uniqueSlug(input.name)
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
        name: input.name,
        slug,
        repoUrl: repo.url,
        branch: repo.branch,
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

  return NextResponse.json(
    {
      project: { id: project.id, name: project.name, slug: project.slug },
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

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
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
