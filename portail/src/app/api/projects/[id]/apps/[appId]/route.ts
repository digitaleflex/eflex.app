import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { deleteApplication } from '@/lib/coolify'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { allowOrg } from '@/lib/rate-limit'
import { requireOrg, requireProject, requireProjectApp, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * Renomme une application du projet. Le dossier, la stack, la position et le
 * statut principal ne changent pas ici.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; appId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id, appId } = await params
  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de modifier ce projet.' },
      { status: 403 },
    )
  }

  if (!(await allowOrg(org.organizationId, 'app-mutate', 30, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications d’applications pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const name = typeof (body as { name?: unknown } | null)?.name === 'string'
    ? (body as { name: string }).name.trim()
    : ''

  if (!name) {
    return NextResponse.json({ error: 'Le nom de l’application ne peut pas être vide.' }, { status: 400 })
  }
  if (name.length > 24) {
    return NextResponse.json({ error: 'Le nom de l’application est trop long (24 caractères maximum).' }, { status: 400 })
  }
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    return NextResponse.json(
      { error: 'Nom d’application invalide : lettres, chiffres et « - », sans commencer par « - ».' },
      { status: 400 },
    )
  }

  const projectResult = await requireProject(org, id, { id: true, name: true })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  const appResult = await requireProjectApp(org, project.id, appId, { id: true })
  if ('response' in appResult) return appResult.response
  const app = appResult.app

  const conflict = await prisma.projectApp.findFirst({
    where: { projectId: project.id, name, id: { not: appId } },
    select: { id: true },
  })
  if (conflict) {
    return NextResponse.json(
      { error: 'Une autre application porte déjà ce nom dans ce projet.' },
      { status: 409 },
    )
  }

  const updated = await prisma.projectApp.update({
    where: { id: app.id },
    data: { name },
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
    },
  })

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id, name: project.name },
  })

  return NextResponse.json({ app: updated })
}

/**
 * Supprime une application d'un projet multi-applications.
 * L'application principale (position 0) est remplacée par la suivante si besoin.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; appId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id, appId } = await params
  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de supprimer cette application.' },
      { status: 403 },
    )
  }

  if (!(await allowOrg(org.organizationId, 'app-mutate', 30, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications d’applications pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const projectResult = await requireProject(org, id, { id: true, name: true })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  const apps = await prisma.projectApp.findMany({
    where: { projectId: project.id },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      position: true,
      coolifyAppId: true,
      domain: true,
      framework: true,
      runtime: true,
      port: true,
      plan: true,
      tlsValid: true,
      tlsExpiresAt: true,
      tlsCheckedAt: true,
    },
  })
  const target = apps.find((app) => app.id === appId)
  if (!target) return NextResponse.json({ error: 'Application introuvable' }, { status: 404 })

  if (apps.length <= 1) {
    return NextResponse.json(
      { error: 'Impossible de supprimer la dernière application du projet.' },
      { status: 409 },
    )
  }

  const active = await prisma.deployment.findFirst({
    where: { appId, status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
    select: { id: true },
  })
  if (active) {
    return NextResponse.json(
      { error: 'Impossible de supprimer cette application tant qu’un déploiement est en cours pour elle.' },
      { status: 409 },
    )
  }

  if (target.coolifyAppId) {
    const deleted = await deleteApplication(target.coolifyAppId)
    if ('error' in deleted) {
      return NextResponse.json(
        { error: `L'application « ${target.name} » n'a pas pu être supprimée côté hébergement : ${deleted.error}` },
        { status: 502 },
      )
    }
  }

  const remaining = apps.filter((app) => app.id !== target.id)
  const promoted = target.position === 0 ? remaining[0]! : null
  const orderedRemaining = promoted ? [promoted, ...remaining.filter((app) => app.id !== promoted.id)] : remaining

  await prisma.$transaction(async (tx) => {
    if (promoted) {
      for (let index = 0; index < orderedRemaining.length; index += 1) {
        const app = orderedRemaining[index]!
        const nextPosition = index
        if (app.position !== nextPosition) {
          await tx.projectApp.update({ where: { id: app.id }, data: { position: nextPosition } })
        }
      }
      await tx.project.update({
        where: { id: project.id },
        data: {
          domain: promoted.domain,
          coolifyAppId: promoted.coolifyAppId,
          framework: promoted.framework,
          runtime: promoted.runtime,
          port: promoted.port,
          plan: promoted.plan as Prisma.InputJsonValue,
          tlsValid: promoted.tlsValid,
          tlsExpiresAt: promoted.tlsExpiresAt,
          tlsCheckedAt: promoted.tlsCheckedAt,
        },
      })
    }

    await tx.projectApp.delete({ where: { id: target.id } })
  })

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id, name: project.name },
  })

  return NextResponse.json({ ok: true })
}
