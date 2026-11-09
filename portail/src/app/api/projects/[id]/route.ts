import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { deleteApplication } from '@/lib/coolify'
import { firstIssue, projectUpdateSchema } from '@/lib/project-settings'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  // Le filtre sur l'organisation garantit qu'on ne lit que les projets de son organisation.
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      repoUrl: true,
      branch: true,
      framework: true,
      runtime: true,
      domain: true,
      port: true,
      createdAt: true,
      updatedAt: true,
      // Seulement les noms des variables : les valeurs ne quittent jamais le serveur.
      envVars: { select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } },
      deployments: {
        select: { id: true, status: true, commitSha: true, logsSummary: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  return NextResponse.json({ project })
}

/**
 * Renomme le projet et/ou change sa branche de production.
 *
 * Le slug et le domaine ne changent jamais : ils identifient l'application
 * déployée (DNS, labels Traefik, application Coolify). La branche, elle, pilote
 * le webhook GitHub : `productionBranch` est mis à jour en même temps.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = projectUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  }

  const existing = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const data: Prisma.ProjectUpdateInput = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.branch !== undefined) {
    data.branch = parsed.data.branch
    data.productionBranch = parsed.data.branch
  }

  const project = await prisma.project.update({
    where: { id: existing.id },
    data,
    select: { id: true, name: true, branch: true, slug: true, domain: true },
  })

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id, name: project.name },
  })

  return NextResponse.json({ project })
}

/**
 * Supprime le projet, ses variables et son historique (cascade Prisma).
 *
 * Si une application Coolify existe, elle est supprimée d'abord : sans cela,
 * le conteneur continuerait de tourner sans plus aucune trace en base. Un
 * échec côté Coolify annule la suppression locale (meilleur message qu'un
 * projet fantôme).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de supprimer ce projet.' },
      { status: 403 },
    )
  }

  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: { id: true, name: true, coolifyAppId: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  if (project.coolifyAppId) {
    const deleted = await deleteApplication(project.coolifyAppId)
    if ('error' in deleted) {
      return NextResponse.json(
        {
          error: `L'application n'a pas pu être supprimée côté Coolify : ${deleted.error}`,
        },
        { status: 502 },
      )
    }
  }

  await prisma.project.delete({ where: { id: project.id } })

  await publish({
    type: 'project.deleted',
    organizationId: org.organizationId,
    payload: { projectId: project.id, name: project.name },
  })

  return NextResponse.json({ ok: true })
}
