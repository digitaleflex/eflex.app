/**
 * Rôles et permissions de l’espace d’administration plateforme (ADM-1).
 *
 * `User.role` stocke le rôle plateforme. Les rôles admin donnent accès à
 * `/admin` et `api/admin/**` selon la matrice ci-dessous. `user` (ou null)
 * n’a aucun accès admin. `ADMIN_EMAILS` ne sert qu’au bootstrap du premier
 * super admin (compte vérifié), jamais à attribuer un autre rôle.
 */

export const ADMIN_ROLES = ['super_admin', 'exploitation', 'support', 'finance'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export type AdminPermission =
  | 'admin.overview.read'
  | 'admin.live.read'
  | 'admin.audit.read'
  | 'admin.monitoring.read'
  | 'admin.deployments.read'
  | 'admin.deployments.manage'
  | 'admin.projects.read'
  | 'admin.projects.manage'
  | 'admin.users.read'
  | 'admin.users.manage'
  | 'admin.impersonation.manage'
  | 'admin.organizations.read'
  | 'admin.organizations.manage'
  | 'admin.payments.read'
  | 'admin.payments.manage'
  | 'admin.support.read'
  | 'admin.support.manage'
  | 'admin.infrastructure.read'
  | 'admin.infrastructure.manage'
  | 'admin.coolify.read'
  | 'admin.coolify.manage'
  | 'admin.roles.manage'

const ALL: readonly AdminPermission[] = [
  'admin.overview.read',
  'admin.live.read',
  'admin.audit.read',
  'admin.monitoring.read',
  'admin.deployments.read',
  'admin.deployments.manage',
  'admin.projects.read',
  'admin.projects.manage',
  'admin.users.read',
  'admin.users.manage',
  'admin.impersonation.manage',
  'admin.organizations.read',
  'admin.organizations.manage',
  'admin.payments.read',
  'admin.payments.manage',
  'admin.support.read',
  'admin.support.manage',
  'admin.infrastructure.read',
  'admin.infrastructure.manage',
  'admin.coolify.read',
  'admin.coolify.manage',
  'admin.roles.manage',
]

const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: ALL,
  exploitation: [
    'admin.overview.read',
    'admin.live.read',
    'admin.audit.read',
    'admin.monitoring.read',
    'admin.deployments.read',
    'admin.deployments.manage',
    'admin.projects.read',
    'admin.projects.manage',
    'admin.infrastructure.read',
    'admin.coolify.read',
  ],
  support: [
    'admin.overview.read',
    'admin.live.read',
    'admin.audit.read',
    'admin.monitoring.read',
    'admin.deployments.read',
    'admin.projects.read',
    'admin.users.read',
    'admin.impersonation.manage',
    'admin.organizations.read',
    'admin.support.read',
    'admin.support.manage',
  ],
  finance: [
    'admin.overview.read',
    'admin.audit.read',
    'admin.organizations.read',
    'admin.payments.read',
    'admin.payments.manage',
  ],
}

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role)
}

/** Compatibilité migration : l'ancien rôle `admin` équivaut à `super_admin`. */
export function normalizeAdminRole(role: string | null | undefined): AdminRole | null {
  if (role === 'admin') return 'super_admin'
  return isAdminRole(role) ? role : null
}

export function hasAdminPermission(role: string | null | undefined, permission: AdminPermission): boolean {
  const normalized = normalizeAdminRole(role)
  if (!normalized) return false
  return ROLE_PERMISSIONS[normalized].includes(permission)
}

export function adminPermissions(role: string | null | undefined): readonly AdminPermission[] {
  const normalized = normalizeAdminRole(role)
  return normalized ? ROLE_PERMISSIONS[normalized] : []
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super administrateur',
  exploitation: 'Exploitation',
  support: 'Support',
  finance: 'Finance',
}
