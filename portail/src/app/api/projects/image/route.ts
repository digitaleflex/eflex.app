import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { assertCryptoConfig, encrypt } from '@/lib/crypto'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { projectDomain, uniqueSlug } from '@/lib/project-slug'
import { getPrimaryApp } from '@/lib/project-apps'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { MAINTENANCE_DEPLOYMENT_MESSAGE, isMaintenanceActive } from '@/lib/platform-settings'
import { assertDeploymentAllowed, assertProjectQuota } from '@/lib/billing'
import { publish } from '@/lib/event-bus'
import { DOCKER_IMAGE_REF_ERROR, isValidDockerImageRef } from '@/lib/docker-image-ref'

const schema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom au projet.').max(60, 'Le nom du projet est trop long (60 caractères maximum).'),
  image: z.string().trim().min(1, "Indiquez la référence de l'image Docker.").max(255, "La référence de l'image est trop longue."),
  port: z.coerce.number().int('Le port doit être un entier.').min(1, 'Le port doit être compris entre 1 et 65535.').max(65535, 'Le port doit être compris entre 1 et 65535.').default(80),
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

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 403 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle dans cette organisation ne permet pas de créer des projets.' }, { status: 403 })
  }

  if (await isMaintenanceActive()) {
    return NextResponse.json({ error: MAINTENANCE_DEPLOYMENT_MESSAGE, code: 'maintenance' }, { status: 503 })
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

  const createLimit = await check(`create:${userId}`, 10, 60_000, { action: 'project-create', scope: 'user' })
  if (!createLimit.allowed) {
    return rateLimitedResponse(createLimit, 'Trop de créations en peu de temps. Patientez une minute.')
  }
  const createOrgLimit = await checkOrg(org.organizationId, 'create', 20, 60_000)
  if (!createOrgLimit.allowed) {
    return rateLimitedResponse(createOrgLimit, 'Trop de créations pour cette organisation en peu de temps. Patientez une minute.')
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

  const image = input.image.trim()
  if (!isValidDockerImageRef(image)) {
    return NextResponse.json({ error: DOCKER_IMAGE_REF_ERROR }, { status: 400 })
  }

  const keys = input.envVars.map((v) => v.key)
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json({ error: 'Une variable d\'environnement est déclarée deux fois.' }, { status: 400 })
  }

  const quota = await assertProjectQuota(org.organizationId, 1)
  if ('error' in quota) {
    return NextResponse.json(
      { error: quota.error, code: 'plan_limit', plan: quota.plan.id, required: quota.required, limit: quota.limit, used: quota.used },
      { status: 403 },
    )
  }

  const rootDomain = process.env.PORTAL_DOMAIN
  const slug = await uniqueSlug(input.name, async (candidate) =>
    Boolean(await prisma.project.findUnique({ where: { slug: candidate }, select: { id: true } })),
  )
  const domain = projectDomain(slug, rootDomain)

  const plan = {
    version: 1 as const,
    source: 'docker-image' as const,
    framework: 'docker' as const,
    runtime: 'docker@image',
    root: '',
    port: input.port,
    image,
  }

  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        userId,
        organizationId: org.organizationId,
        name: input.name,
        slug,
        domain,
        repoUrl: `docker-image://${image}`,
        branch: 'main',
        repoFullName: null,
        installationId: null,
        repoPrivate: false,
        productionBranch: null,
        framework: 'docker',
        runtime: 'docker@image',
        port: input.port,
        plan: plan as unknown as Prisma.InputJsonValue,
        detection: {
          source: 'docker-image',
          image,
          confidence: 1,
          reasons: ["Déploiement depuis une image Docker fournie."],
          warnings: [],
          analyzedAt: new Date().toISOString(),
        },
      },
    })

    const app = await tx.projectApp.create({
      data: {
        projectId: project.id,
        name: 'app',
        root: '',
        position: 0,
        plan: plan as unknown as Prisma.InputJsonValue,
        framework: 'docker',
        runtime: 'docker@image',
        port: input.port,
        domain,
      },
    })

    if (input.envVars.length > 0) {
      await tx.envVar.createMany({
        data: input.envVars.map((v) => ({
          projectId: project.id,
          key: v.key,
          value: encrypt(v.value, `${project.id}:${v.key}`),
        })),
      })
    }
    return { project, app }
  })

  await publish({ type: 'project.created', organizationId: org.organizationId, payload: { projectId: created.project.id, name: created.project.name } })

  const queued = await enqueueProjectDeployment(created.project, {
    apps: [{ id: created.app.id, name: created.app.name }],
  })

  const warning = 'error' in queued ? queued.error : null
  const deployments = ('deployments' in queued ? queued.deployments : undefined) ?? []
  const firstDeployment = deployments[0] ?? null

  return NextResponse.json(
    {
      project: {
        id: created.project.id,
        name: created.project.name,
        slug: created.project.slug,
        domain: created.app.domain,
      },
      apps: [{ id: created.app.id, name: created.app.name, root: '', domain: created.app.domain, deploymentId: firstDeployment?.id ?? null }],
      deployment: firstDeployment ? { id: firstDeployment.id, status: firstDeployment.status } : null,
      deployments,
      groupId: 'groupId' in queued ? (queued.groupId ?? null) : null,
      plan: {
        framework: 'docker',
        buildPack: 'dockerimage',
        port: input.port,
        services: ['app'],
        postDeploy: [],
        image,
      },
      warning,
    },
    { status: 202 },
  )
}
