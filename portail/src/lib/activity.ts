import type { Prisma } from '@prisma/client'
import { ACTIVE_DEPLOYMENT_STATUSES } from './deployment-state'

/**
 * Filtres et pagination de la page « Activité » (#50).
 *
 * Module pur : aucune requête Prisma n'est exécutée ici, la page se contente de
 * brancher `activityWhere` sur `prisma.deployment`.
 */

export const ACTIVITY_PAGE_SIZE = 30

export const ACTIVITY_FILTERS = ['all', 'live', 'failed', 'active'] as const
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]

export const ACTIVITY_FILTER_LABEL: Record<ActivityFilter, string> = {
  all: 'Tous',
  live: 'Réussis',
  failed: 'En échec',
  active: 'En cours',
}

/** Lit `?status=` : toute valeur inconnue retombe sur « Tous ». */
export function parseActivityFilter(value: string | string[] | undefined): ActivityFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && (ACTIVITY_FILTERS as readonly string[]).includes(raw)
    ? (raw as ActivityFilter)
    : 'all'
}

export function parseActivityPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const page = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

/** Restriction Prisma : toujours bornée à l'organisation résolue côté serveur. */
export function activityWhere(organizationId: string, filter: ActivityFilter): Prisma.DeploymentWhereInput {
  const where: Prisma.DeploymentWhereInput = { project: { organizationId } }
  if (filter === 'live') where.status = 'live'
  else if (filter === 'failed') where.status = 'failed'
  else if (filter === 'active') where.status = { in: [...ACTIVE_DEPLOYMENT_STATUSES] }
  return where
}

export function activityHref(filter: ActivityFilter, page = 1): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('status', filter)
  if (page > 1) params.set('page', String(page))
  const search = params.toString()
  return `/dashboard/activity${search ? `?${search}` : ''}`
}

/** Gabarit attendu par le composant `Pagination` (chaîne sérialisable). */
export function activityHrefTemplate(filter: ActivityFilter): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('status', filter)
  params.set('page', '')
  return `/dashboard/activity?${params.toString()}`
}

export type ActivityEmptyCopy = { title: string; description: string; resetLabel: string | null }

/** État vide adapté au filtre : le texte explique pourquoi la liste peut être vide. */
export function activityEmptyState(filter: ActivityFilter): ActivityEmptyCopy {
  switch (filter) {
    case 'live':
      return {
        title: 'Aucun déploiement réussi',
        description: 'Les déploiements qui atteignent la mise en ligne apparaîtront ici.',
        resetLabel: 'Voir tous les déploiements',
      }
    case 'failed':
      return {
        title: 'Aucun déploiement en échec',
        description: 'Tous les déploiements de la période ont abouti. Les échecs éventuels apparaîtront ici.',
        resetLabel: 'Voir tous les déploiements',
      }
    case 'active':
      return {
        title: 'Aucun déploiement en cours',
        description: 'Les déploiements en file, en analyse ou en construction apparaîtront ici.',
        resetLabel: 'Voir tous les déploiements',
      }
    default:
      return {
        title: 'Aucun déploiement pour le moment',
        description:
          'Chaque mise en ligne de vos projets apparaîtra ici, avec son statut, sa branche, son commit et sa date.',
        resetLabel: null,
      }
  }
}
