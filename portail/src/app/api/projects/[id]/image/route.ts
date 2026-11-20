import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { publish } from '@/lib/event-bus'
import { getPrimaryApp } from '@/lib/project-apps'
import { requireManagedProjectForMutation, requireProjectApp, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const IMAGE_REF_RE = /^[a-z0-9][a-z0-9._\-\/]*(:[A-Za-z0-9_][A-Za-z0-9._\-]{0,127})?(@sha256:[a-f0-9]{64})?$/
const IMAGE_REF_HOST_RE = /^[a-z0-9][a-z0-9.\-]*(?::[0-9]{2,5})?(?:\/[a-z0-9][a-z0-9._\-\/]*)?(?::[A-Za-z0-9_][A-Za-z0-9._\-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/

function isValidDockerImageRef(ref: string): boolean {
  if (ref.includes(' ') || /[;&|`$<>\\]/.test(ref)) return false
  if (IMAGE_REF_RE.test(ref)) return true
  if (IMAGE_REF_HOST_RE.test(ref)) return true
  return false
}

function isDockerImagePlan(value: unknown): value is { source: 'docker-image'; image: string; port?: number } {
  if (typeof value !== 'object' || value === null) return false
  const plan = value as Record<string, unknown>
  return plan.source === 'docker-image' && typeof plan.image === 'string'
}

const patchSchema = z
  .object({
    appId: z.string().trim().min(1).optional(),
    image: z.string().trim().min(1, "Indiquez la référence de l'image Docker.").max(255).optional(),
    port: z.number().int('Le port doit être un entier.').min(1).max(65535).optional(),
  })
  .refine((value) => value.image !== undefined || value.port !== undefined, {
    message: 'Aucune modification fournie.',
  })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  const userLimit = await check(`project-image:${session.user.id}`, 30, 60_000, { action: 'project-image', scope: 'user' })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop de modifications en peu de temps. Patientez une minute.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }
  if (parsed.data.image !== undefined && !isValidDockerImageRef(parsed.data.image)) {
    return NextResponse.json(
      { error: "Référence d'image Docker invalide. Utilisez un nom d'image, un tag et/ou un digest valides (ex. nginx:1.27, ghcr.io/org/app:latest, image@sha256:…)." },
      { status: 400 },
    )
  }

  const scoped = await requireManagedProjectForMutation(session, id, {
    id: true,
    name: true,
    repoUrl: true,
    port: true,
    plan: true,
    detection: true,
    framework: true,
    runtime: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, plan: true, port: true, framework: true, runtime: true },
    },
  })
  if ('response' in scoped) return scoped.response
  const { org, project } = scoped

  const orgLimit = await checkOrg(org.organizationId, 'project-mutate', 60, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop de modifications de projets pour cette organisation. Patientez une minute.')
  }

  let targetApp = parsed.data.appId
    ? project.apps.find((app) => app.id === parsed.data.appId) ?? null
    : getPrimaryApp(project.apps) ?? project.apps[0] ?? null
  if (parsed.data.appId && !targetApp) {
    // Ré-vérifier via la chaîne tenant si l'app demandée n'est pas dans le lot chargé (défensif).
    const appResult = await requireProjectApp(org, project.id, parsed.data.appId, {
      id: true, name: true, position: true, plan: true, port: true, framework: true, runtime: true,
    })
    if ('response' in appResult) return appResult.response
    targetApp = appResult.app
  }
  if (!targetApp) return tenantNotFound('Application introuvable.')

  const sourcePlan = isDockerImagePlan(targetApp.plan)
    ? targetApp.plan
    : isDockerImagePlan(project.plan)
      ? project.plan
      : null
  if (!sourcePlan) {
    return NextResponse.json(
      { error: "Ce projet n'est pas déployé depuis une image Docker." },
      { status: 409 },
    )
  }

  const nextImage = parsed.data.image ?? sourcePlan.image
  const nextPort = parsed.data.port ?? targetApp.port ?? project.port ?? 80
  const nextPlan = { ...sourcePlan, image: nextImage, port: nextPort }
  const nextDetection = {
    ...(typeof project.detection === 'object' && project.detection !== null ? (project.detection as Record<string, unknown>) : {}),
    source: 'docker-image',
    image: nextImage,
    confidence: 1,
    reasons: ["Déploiement depuis une image Docker fournie."],
    warnings: [],
    analyzedAt: new Date().toISOString(),
  }

  const isPrimary = getPrimaryApp(project.apps)?.id === targetApp.id || targetApp.position === 0
  await prisma.$transaction(async (tx) => {
    await tx.projectApp.update({
      where: { id: targetApp!.id },
      data: {
        plan: nextPlan as object,
        port: nextPort,
        framework: 'docker',
        runtime: 'docker@image',
      },
    })
    if (isPrimary) {
      await tx.project.update({
        where: { id: project.id },
        data: {
          repoUrl: `docker-image://${nextImage}`,
          port: nextPort,
          plan: nextPlan as object,
          detection: nextDetection as object,
          framework: 'docker',
          runtime: 'docker@image',
        },
      })
    }
  })

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id, name: project.name },
  })

  return NextResponse.json({
    ok: true,
    appId: targetApp.id,
    image: nextImage,
    port: nextPort,
  })
}
