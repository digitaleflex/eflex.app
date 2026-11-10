import { prisma } from '@/lib/prisma'

/** Slug de l'organisation personnelle : dérivé de l'identifiant utilisateur (unique, stable). */
export function personalOrganizationSlug(userId: string): string {
  return `u-${userId.toLowerCase()}`
}

type SessionLike = { user: { id: string }; session: { activeOrganizationId?: string | null } }

/**
 * Organisation sur laquelle agit la requête : celle de la session si l'utilisateur en est
 * toujours membre, sinon sa première organisation. Renvoie aussi son rôle.
 * Toute lecture ou écriture de projet doit passer par là : c'est la frontière entre locataires.
 */
export async function resolveOrganization(session: SessionLike): Promise<{ organizationId: string; role: string } | null> {
  const wanted = session.session.activeOrganizationId
  const member = await prisma.member.findFirst({
    where: { userId: session.user.id, ...(wanted ? { organizationId: wanted } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true, role: true },
  })
  if (member) return member
  if (!wanted) return null
  // L'organisation de la session n'est plus accessible (retrait, suppression) : repli.
  return prisma.member.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true, role: true },
  })
}

/** Les rôles autorisés à créer, redéployer ou supprimer des projets. */
export const canManageProjects = (role: string) => role === 'owner' || role === 'admin'

/**
 * Accès à la facturation : propriétaire, administrateur et rôle dédié
 * `billing`. Un simple membre n'a jamais accès aux plans, factures, paiements,
 * variables d'environnement ni journaux.
 */
export const canManageBilling = (role: string) =>
  role === 'owner' || role === 'admin' || role === 'billing'
