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

/** Rôles d'organisation reconnus (Better Auth + rôle `billing` propre à EFLEX). */
export type OrganizationRole = 'owner' | 'admin' | 'billing' | 'member'
export const ORGANIZATION_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'billing', 'member']

/** Libellés français des rôles, affichés tels quels dans l'interface. */
export const ORGANIZATION_ROLE_LABEL: Record<OrganizationRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  billing: 'Facturation',
  member: 'Membre',
}

export const organizationRoleLabel = (role: string): string =>
  ORGANIZATION_ROLE_LABEL[role as OrganizationRole] ?? role

/** Capacités réelles de chaque rôle (Better Auth) : aide lisible, sans modifier les permissions. */
export const ORGANIZATION_ROLE_DESCRIPTION: Record<OrganizationRole, string> = {
  owner:
    "Gère l'organisation, les membres, les projets et la facturation. Seul rôle autorisé à supprimer l'organisation.",
  admin: 'Gère les membres et les projets, et accède à la facturation.',
  billing: "Gère l'abonnement et les paiements, sans accès aux projets ni aux journaux.",
  member:
    "Consulte les projets de l'organisation. Ne peut ni créer, ni redéployer, ni modifier les paramètres, ni gérer la facturation.",
}

/** Capacité affichée dans la matrice UI : vraie, partielle ou absente pour un rôle. */
export type RoleCapabilityLevel = 'yes' | 'no' | 'limited'

export type OrganizationRoleCapability = {
  id: string
  label: string
  hint: string
  levels: Record<OrganizationRole, RoleCapabilityLevel>
}

/**
 * Matrice lisible des capacités par rôle. Elle reflète les contrôles Better Auth
 * et les gardes applicatives (`canManageProjects`, `canManageBilling`, routes API).
 * Ne pas l'utiliser comme source d'autorisation : le serveur reste la source de vérité.
 */
export const ORGANIZATION_ROLE_CAPABILITIES: readonly OrganizationRoleCapability[] = [
  {
    id: 'projects-read',
    label: 'Lecture des projets',
    hint: 'Voir les projets, services et informations non sensibles de l’organisation.',
    levels: { owner: 'yes', admin: 'yes', billing: 'no', member: 'yes' },
  },
  {
    id: 'projects-manage',
    label: 'Gestion des projets',
    hint: 'Créer, redéployer, modifier les paramètres ou supprimer un projet.',
    levels: { owner: 'yes', admin: 'yes', billing: 'no', member: 'no' },
  },
  {
    id: 'billing',
    label: 'Facturation',
    hint: 'Consulter le plan, les paiements, les factures et demander un changement de plan.',
    levels: { owner: 'yes', admin: 'yes', billing: 'yes', member: 'no' },
  },
  {
    id: 'team',
    label: 'Gestion de l’équipe',
    hint: 'Inviter des personnes, modifier des rôles et retirer des membres.',
    levels: { owner: 'yes', admin: 'yes', billing: 'no', member: 'no' },
  },
  {
    id: 'org-delete',
    label: 'Suppression de l’organisation',
    hint: 'Action irréversible, réservée au propriétaire.',
    levels: { owner: 'yes', admin: 'no', billing: 'no', member: 'no' },
  },
]

/** Rôles autorisés à créer, redéployer, modifier ou supprimer des projets. */
export const canManageProjects = (role: string): boolean => role === 'owner' || role === 'admin'

/**
 * Accès à la facturation : propriétaire, administrateur et rôle dédié
 * `billing`. Un simple membre n'a jamais accès aux plans, factures, paiements,
 * variables d'environnement ni journaux.
 */
export const canManageBilling = (role: string): boolean =>
  role === 'owner' || role === 'admin' || role === 'billing'

/** Gestion de l'équipe (invitations, rôles, retrait) selon les permissions Better Auth. */
export const canManageMembers = (role: string): boolean => role === 'owner' || role === 'admin'

/** Actions sensibles lisibles, pour expliquer l'impact avant confirmation. */
export const organizationActionImpact = {
  invite: "La personne invitée devra accepter avec l'adresse e-mail invitée. Son accès dépendra du rôle choisi.",
  changeRole: "Le changement de rôle prend effet immédiatement et modifie ce que la personne peut voir ou faire.",
  removeMember:
    "La personne retirée perd immédiatement l'accès aux projets de l'organisation. Ses autres organisations ne sont pas touchées.",
  leave:
    "Vous perdrez l'accès aux projets de cette organisation. Un propriétaire ou un administrateur pourra vous réinviter.",
  deleteOrganization:
    "Action irréversible : l'organisation et ses projets seront supprimés de la base. Les applications déployées doivent d'abord être retirées.",
} as const
