import type { Prisma } from '@prisma/client'

/**
 * Recherche et filtres de la liste des utilisateurs d'administration (#51).
 *
 * Module pur : la page branche `userListWhere` sur Prisma et construit ses liens
 * avec `userListHref`. Aucune donnée sensible n'est lue ici.
 */

export const ADMIN_USERS_PAGE_SIZE = 20
export const USER_SEARCH_MAX = 100

export const USER_ROLE_FILTERS = ['all', 'admin', 'member'] as const
export type UserRoleFilter = (typeof USER_ROLE_FILTERS)[number]

export const USER_STATUS_FILTERS = ['all', 'active', 'suspended'] as const
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number]

export const USER_VERIFICATION_FILTERS = ['all', 'verified', 'unverified'] as const
export type UserVerificationFilter = (typeof USER_VERIFICATION_FILTERS)[number]

export type UserListQuery = {
  /** Recherche libre sur le nom ou l'adresse e-mail. */
  query: string
  role: UserRoleFilter
  status: UserStatusFilter
  verification: UserVerificationFilter
  page: number
}

export const USER_ROLE_LABEL: Record<UserRoleFilter, string> = {
  all: 'Tous les rôles',
  admin: 'Administrateurs',
  member: 'Comptes standard',
}

export const USER_STATUS_LABEL: Record<UserStatusFilter, string> = {
  all: 'Tous les statuts',
  active: 'Comptes actifs',
  suspended: 'Comptes suspendus',
}

export const USER_VERIFICATION_LABEL: Record<UserVerificationFilter, string> = {
  all: 'Toutes les vérifications',
  verified: 'E-mails vérifiés',
  unverified: 'E-mails non vérifiés',
}

const oneOf = <T extends string>(values: readonly T[], value: string | undefined): T =>
  typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : values[0]!

/** Normalise les paramètres d'URL de `/admin/users` (valeurs inconnues ignorées). */
export function parseUserListQuery(input: {
  q?: string
  role?: string
  statut?: string
  email?: string
  page?: string
}): UserListQuery {
  return {
    query: (input.q ?? '').trim().slice(0, USER_SEARCH_MAX),
    role: oneOf(USER_ROLE_FILTERS, input.role),
    status: oneOf(USER_STATUS_FILTERS, input.statut),
    verification: oneOf(USER_VERIFICATION_FILTERS, input.email),
    page: Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1),
  }
}

/**
 * Restriction Prisma. Les filtres se cumulent (`AND`) ; la recherche porte sur
 * le nom et l'e-mail. Le rôle « standard » inclut les comptes sans rôle explicite.
 */
export function userListWhere(query: UserListQuery): Prisma.UserWhereInput {
  const filters: Prisma.UserWhereInput[] = []

  if (query.query) {
    filters.push({
      OR: [
        { name: { contains: query.query, mode: 'insensitive' } },
        { email: { contains: query.query, mode: 'insensitive' } },
      ],
    })
  }
  if (query.role === 'admin') filters.push({ role: 'admin' })
  if (query.role === 'member') filters.push({ OR: [{ role: null }, { role: { not: 'admin' } }] })
  if (query.status === 'active') filters.push({ banned: false })
  if (query.status === 'suspended') filters.push({ banned: true })
  if (query.verification === 'verified') filters.push({ emailVerified: true })
  if (query.verification === 'unverified') filters.push({ emailVerified: false })

  if (filters.length === 0) return {}
  if (filters.length === 1) return filters[0]!
  return { AND: filters }
}

/** Vrai dès qu'un filtre ou une recherche restreint la liste. */
export function isUserListFiltered(query: UserListQuery): boolean {
  return query.query !== '' || query.role !== 'all' || query.status !== 'all' || query.verification !== 'all'
}

const appendFilters = (params: URLSearchParams, query: UserListQuery) => {
  if (query.query) params.set('q', query.query)
  if (query.role !== 'all') params.set('role', query.role)
  if (query.status !== 'all') params.set('statut', query.status)
  if (query.verification !== 'all') params.set('email', query.verification)
}

/** Lien d'un jeu de filtres (ou d'une page) en conservant les autres paramètres. */
export function userListHref(query: UserListQuery, overrides: Partial<UserListQuery> = {}): string {
  const merged = { ...query, ...overrides }
  const params = new URLSearchParams()
  appendFilters(params, merged)
  if (merged.page > 1) params.set('page', String(merged.page))
  const search = params.toString()
  return `/admin/users${search ? `?${search}` : ''}`
}

/** Gabarit attendu par `Pagination` (chaîne sérialisable, page laissée vide). */
export function userListHrefTemplate(query: UserListQuery): string {
  const params = new URLSearchParams()
  appendFilters(params, query)
  params.set('page', '')
  return `/admin/users?${params.toString()}`
}

/** « Administrateur » / « Compte standard » : le rôle plateforme est distinct du rôle d'organisation. */
export function userRoleLabel(role: string | null | undefined): string {
  return role === 'admin' ? 'Administrateur' : 'Compte standard'
}

export function userSuspensionLabel(banned: boolean): string {
  return banned ? 'Suspendu' : 'Actif'
}

export function userVerificationLabel(verified: boolean): string {
  return verified ? 'Vérifié' : 'Non vérifié'
}
