import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { audit } from '@/lib/audit'
import { deleteApplication, deletePrivateKey, deleteManagedDatabase } from '@/lib/coolify'
import { resolveProjectToken } from '@/lib/git-credentials'
import { deleteDeployKey } from '@/lib/github-app'
import { parseGitHubUrl } from '@/lib/github-url'
import { getPrimaryApp } from '@/lib/project-apps'
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
      createdAt: true,
      updatedAt: true,
      // Repli de transition (Lot G) : inclus sans être exposé directement.
      coolifyAppId: true,
      // Seulement les noms des variables : les valeurs ne quittent jamais le serveur.
      envVars: { select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } },
      // Applications du projet (D2) : nom, dossier, domaine, TLS et dernier déploiement.
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          root: true,
          position: true,
          plan: true,
          framework: true,
          runtime: true,
          port: true,
          domain: true,
          coolifyAppId: true,
          tlsValid: true,
          tlsExpiresAt: true,
          tlsCheckedAt: true,
          deployments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, commitSha: true, createdAt: true },
          },
        },
      },
      deployments: {
        select: {
          id: true,
          appId: true,
          status: true,
          commitSha: true,
          logsSummary: true,
          createdAt: true,
          app: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const { apps, coolifyAppId: legacyCoolifyAppId, ...rest } = project
  const primary = getPrimaryApp(apps)
  return NextResponse.json({
    project: {
      ...rest,
      framework: primary?.framework ?? null,
      runtime: primary?.runtime ?? null,
      domain: primary?.domain ?? null,
      port: primary?.port ?? 80,
      coolifyAppId: primary?.coolifyAppId ?? legacyCoolifyAppId ?? null,
      tlsValid: primary?.tlsValid ?? null,
      tlsExpiresAt: primary?.tlsExpiresAt ?? null,
      tlsCheckedAt: primary?.tlsCheckedAt ?? null,
      apps: apps.map(({ deployments, ...app }) => ({
        ...app,
        lastDeployment: deployments[0] ?? null,
      })),
      primaryAppId: primary?.id ?? null,
    },
  })
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
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    select: {
      id: true,
      name: true,
      userId: true,
      coolifyAppId: true,
      apps: { select: { name: true, coolifyAppId: true } },
      installationId: true,
      repoUrl: true,
      repoFullName: true,
      githubDeployKeyId: true,
      coolifyPrivateKeyUuid: true,
      databases: { select: { coolifyId: true, kind: true } },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  // Applications Coolify du projet (D2) : une par `ProjectApp`, avec repli sur
  // le miroir `Project.coolifyAppId` pendant la transition. Un échec annule la
  // suppression locale, jamais de conteneur orphelin silencieux.
  const coolifyAppIds = [
    ...new Set(
      [...project.apps.map((app) => app.coolifyAppId), project.coolifyAppId].filter(
        (appId): appId is string => Boolean(appId),
      ),
    ),
  ]
  for (const coolifyAppId of coolifyAppIds) {
    const deleted = await deleteApplication(coolifyAppId)
    if ('error' in deleted) {
      const appName = project.apps.find((app) => app.coolifyAppId === coolifyAppId)?.name
      return NextResponse.json(
        {
          error: `L'application ${appName ? `« ${appName} » ` : ''}n'a pas pu être supprimée côté hébergement : ${deleted.error}`,
        },
        { status: 502 },
      )
    }
  }

  // Les bases managées sont des ressources facturées : on refuse la suppression
  // du projet si l'une d'elles ne peut pas être supprimée.
  for (const database of project.databases) {
    const deleted = await deleteManagedDatabase(database.coolifyId)
    if ('error' in deleted) {
      return NextResponse.json(
        { error: `La base ${database.kind} n'a pas pu être supprimée : ${deleted.error}` },
        { status: 502 },
      )
    }
  }

  // Nettoyage des accès au dépôt privé : deploy key GitHub et clé privée Coolify.
  // Au mieux : une clé orpheline ne doit pas empêcher la suppression du projet.
  if (project.coolifyPrivateKeyUuid) {
    await deletePrivateKey(project.coolifyPrivateKeyUuid).catch(() => undefined)
  }
  if (project.githubDeployKeyId) {
    const token = await resolveProjectToken({ userId: project.userId, installationId: project.installationId })
    const [owner, repo] = project.repoFullName?.split('/') ?? []
    const ref = owner && repo ? { owner, repo } : parseGitHubUrl(project.repoUrl)
    if (token && ref) {
      await deleteDeployKey(token, ref.owner, ref.repo, project.githubDeployKeyId).catch(() => undefined)
    }
  }

  await prisma.project.delete({ where: { id: project.id } })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.delete',
    target: { type: 'project', id: project.id },
    organizationId: org.organizationId,
    details: { projectName: project.name },
    request,
  })

  await publish({
    type: 'project.deleted',
    organizationId: org.organizationId,
    payload: { projectId: project.id, name: project.name },
  })

  return NextResponse.json({ ok: true })
}
