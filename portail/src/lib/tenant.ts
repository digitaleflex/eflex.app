import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import type { Prisma } from '@prisma/client'

type SessionLike = { user: { id: string }; session: { activeOrganizationId?: string | null } }

/** Résultat d'une résolution d'organisation pour un handler de route. */
export type ResolvedOrg = { organizationId: string; role: string }

/**
 * Résout l'organisation de la session. À utiliser en tout début de route tenant-scopée.
 * Renvoie `null` si l'utilisateur n'appartient à aucune organisation accessible.
 */
export async function requireOrg(session: SessionLike): Promise<ResolvedOrg | null> {
  return resolveOrganization(session)
}

/**
 * Réponse standard quand l'organisation ne peut pas être résolue pour la ressource demandée.
 * On renvoie 404 (et non 403) pour ne pas révéler l'existence d'une ressource d'un autre locataire.
 */
export function tenantNotFound(message = 'Ressource introuvable.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

/** 403 quand le rôle ne permet pas la mutation demandée. */
export function forbidden(message = 'Accès refusé.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 })
}

/**
 * Vérifie que le rôle peut gérer les projets de l'organisation (création, déploiement, suppression, mutations).
 */
export function assertProjectManager(org: ResolvedOrg): NextResponse | null {
  if (canManageProjects(org.role)) return null
  return forbidden('Votre rôle dans cette organisation ne permet pas d’effectuer cette action.')
}

/**
 * Charge un projet en garantissant qu'il appartient à l'organisation résolue.
 * Ne jamais remplacer par un `findUnique` sur l'id seul pour une route tenant-scopée.
 */
export async function requireProject<T extends Prisma.ProjectSelect>(
  org: ResolvedOrg,
  projectId: string,
  select: T,
): Promise<{ project: Prisma.ProjectGetPayload<{ select: T }> } | { response: NextResponse }> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: org.organizationId },
    select,
  })
  if (!project) return { response: tenantNotFound('Projet introuvable') }
  return { project }
}

/**
 * Charge un déploiement en garantissant qu'il appartient à un projet de l'organisation résolue.
 */
export async function requireDeployment<T extends Prisma.DeploymentSelect>(
  org: ResolvedOrg,
  projectId: string,
  deploymentId: string,
  select: T,
): Promise<{ deployment: Prisma.DeploymentGetPayload<{ select: T }> } | { response: NextResponse }> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, projectId, project: { organizationId: org.organizationId } },
    select,
  })
  if (!deployment) return { response: tenantNotFound('Déploiement introuvable') }
  return { deployment }
}

/**
 * Charge un déploiement par son id global en garantissant l'appartenance à l'organisation résolue
 * (utilisé par `/api/deployments/[id]`).
 */
export async function requireDeploymentById<T extends Prisma.DeploymentSelect>(
  org: ResolvedOrg,
  deploymentId: string,
  select: T,
): Promise<{ deployment: Prisma.DeploymentGetPayload<{ select: T }> } | { response: NextResponse }> {
  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, project: { organizationId: org.organizationId } },
    select,
  })
  if (!deployment) return { response: tenantNotFound('Déploiement introuvable') }
  return { deployment }
}

/** Charge une application de projet en garantissant la chaîne projet -> organisation. */
export async function requireProjectApp<T extends Prisma.ProjectAppSelect>(
  org: ResolvedOrg,
  projectId: string,
  appId: string,
  select: T,
): Promise<{ app: Prisma.ProjectAppGetPayload<{ select: T }> } | { response: NextResponse }> {
  const app = await prisma.projectApp.findFirst({
    where: { id: appId, projectId, project: { organizationId: org.organizationId } },
    select,
  })
  if (!app) return { response: tenantNotFound('Application introuvable.') }
  return { app }
}

/** Charge un domaine personnalisé en garantissant la chaîne projet -> organisation. */
export async function requireProjectDomain<T extends Prisma.ProjectDomainSelect>(
  org: ResolvedOrg,
  projectId: string,
  domainId: string,
  select: T,
): Promise<{ domain: Prisma.ProjectDomainGetPayload<{ select: T }> } | { response: NextResponse }> {
  const domain = await prisma.projectDomain.findFirst({
    where: { id: domainId, projectId, project: { organizationId: org.organizationId } },
    select,
  })
  if (!domain) return { response: tenantNotFound('Domaine introuvable.') }
  return { domain }
}

/** Charge une base managée en garantissant la chaîne projet -> organisation. */
export async function requireProjectDatabase<T extends Prisma.ProjectDatabaseSelect>(
  org: ResolvedOrg,
  projectId: string,
  databaseId: string,
  select: T,
): Promise<{ database: Prisma.ProjectDatabaseGetPayload<{ select: T }> } | { response: NextResponse }> {
  const database = await prisma.projectDatabase.findFirst({
    where: { id: databaseId, projectId, project: { organizationId: org.organizationId } },
    select,
  })
  if (!database) return { response: tenantNotFound('Base de données introuvable.') }
  return { database }
}
