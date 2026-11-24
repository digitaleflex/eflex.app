/**
 * État de la plateforme (page d'accueil admin).
 *
 * Module pur : reçoit des mesures déjà lues et renvoie un niveau global et une
 * ligne par signal, chacune avec un lien vers son détail. Les seuils sont des
 * constantes nommées, faciles à ajuster.
 */
import { overallHealth, type HealthLevel } from './infrastructure-health'

/** Déploiements en échec sur 24 h : au-delà, la plateforme est « à surveiller » puis « critique ». */
export const FAILED_DEPLOYMENTS_WARNING = 1
export const FAILED_DEPLOYMENTS_DANGER = 5

export interface PlatformStatusInput {
  /** `null` : la collecte d'infrastructure a échoué (niveau inconnu, jamais « tout va bien »). */
  infrastructure: Array<{ key: string; label: string; level: HealthLevel; detail: string | null }> | null
  failedDeployments24h: number
  openSiteIncidents: number
  /** Bases PostgreSQL managées sans sauvegarde planifiée. */
  databasesWithoutBackup: number
}

export interface PlatformStatusRow {
  key: string
  label: string
  level: HealthLevel
  detail: string
  href: string
}

export interface PlatformStatus {
  overall: HealthLevel
  rows: PlatformStatusRow[]
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`
}

export function failedDeploymentsLevel(count: number): HealthLevel {
  if (count >= FAILED_DEPLOYMENTS_DANGER) return 'danger'
  if (count >= FAILED_DEPLOYMENTS_WARNING) return 'warning'
  return 'ok'
}

export function buildPlatformStatus(input: PlatformStatusInput): PlatformStatus {
  const rows: PlatformStatusRow[] = []

  if (input.infrastructure === null) {
    rows.push({
      key: 'infrastructure',
      label: 'Infrastructure',
      level: 'unknown',
      detail: 'Collecte impossible : l’état de l’infrastructure est inconnu.',
      href: '/admin/infrastructure',
    })
  } else {
    for (const source of input.infrastructure) {
      rows.push({
        key: `infra-${source.key}`,
        label: source.label,
        level: source.level,
        detail: source.detail ?? (source.level === 'ok' ? 'Opérationnel' : 'Voir le détail'),
        href: '/admin/infrastructure',
      })
    }
  }

  const failed = input.failedDeployments24h
  rows.push({
    key: 'deployments-failed',
    label: 'Déploiements en échec (24 h)',
    level: failedDeploymentsLevel(failed),
    detail: failed === 0 ? 'Aucun échec' : plural(failed, 'échec', 'échecs'),
    href: '/admin/deployments',
  })

  const incidents = input.openSiteIncidents
  rows.push({
    key: 'site-incidents',
    label: 'Sites clients en incident',
    level: incidents > 0 ? 'warning' : 'ok',
    detail: incidents === 0 ? 'Aucun incident ouvert' : plural(incidents, 'incident ouvert', 'incidents ouverts'),
    href: '/admin/monitoring',
  })

  const noBackup = input.databasesWithoutBackup
  rows.push({
    key: 'backups',
    label: 'Sauvegardes des bases clientes',
    level: noBackup > 0 ? 'warning' : 'ok',
    detail:
      noBackup === 0
        ? 'Toutes les bases ont une sauvegarde planifiée'
        : `${plural(noBackup, 'base sans sauvegarde planifiée', 'bases sans sauvegarde planifiée')}`,
    href: '/admin/projects',
  })

  return { overall: overallHealth(rows.map((row) => row.level)), rows }
}
