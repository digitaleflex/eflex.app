/**
 * Agrégations de santé de l'infrastructure (issue 31).
 *
 * Module **pur** : aucune base, aucun réseau, aucun Redis. Il reçoit des
 * valeurs déjà lues par l'appelant (page d'administration, route de contrôle)
 * et renvoie des états, des seuils et des libellés français prêts à afficher.
 * Les tests s'exécutent donc sans infrastructure.
 */
import { ACTIVE_DEPLOYMENT_STATUSES, isTerminal } from './deployment-state'

export type HealthLevel = 'ok' | 'warning' | 'danger' | 'unknown'

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  ok: 'Opérationnel',
  warning: 'À surveiller',
  danger: 'Critique',
  unknown: 'Inconnu',
}

const LEVEL_WEIGHT: Record<HealthLevel, number> = {
  ok: 0,
  unknown: 1,
  warning: 2,
  danger: 3,
}

/** Pire état d'une liste : une seule source en rouge rend l'ensemble critique. */
export function worstLevel(levels: readonly HealthLevel[]): HealthLevel {
  if (levels.length === 0) return 'unknown'
  return levels.reduce<HealthLevel>(
    (worst, level) => (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[worst] ? level : worst),
    'ok',
  )
}

/** État global de la plateforme à partir des états de chaque source. */
export function overallHealth(levels: readonly HealthLevel[]): HealthLevel {
  return worstLevel(levels)
}

/* ------------------------------------------------------------------ */
/* Certificats TLS                                                     */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000

/** Un certificat à moins de 30 jours est à surveiller, 7 jours : critique. */
export const CERT_WARNING_DAYS = 30
export const CERT_CRITICAL_DAYS = 7

export interface CertificateRisk {
  level: HealthLevel
  /** Jours restants arrondis au supérieur ; négatif si expiré ; `null` si inconnu. */
  daysLeft: number | null
  label: string
}

/** Accepte une date, une chaîne ISO ou `null` ; renvoie un temps epoch ou `null`. */
export function toEpoch(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const time = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(time) ? time : null
}

export function certificateRisk(
  expiresAt: Date | string | null | undefined,
  now: number = Date.now(),
): CertificateRisk {
  const time = toEpoch(expiresAt)
  if (time === null) return { level: 'unknown', daysLeft: null, label: 'Expiration inconnue' }

  const daysLeft = Math.ceil((time - now) / DAY_MS)
  if (daysLeft < 0) {
    const days = Math.abs(daysLeft)
    return {
      level: 'danger',
      daysLeft,
      label: days === 0 ? 'Expiré aujourd’hui' : `Expiré depuis ${days} jour${days > 1 ? 's' : ''}`,
    }
  }
  if (daysLeft === 0) return { level: 'danger', daysLeft, label: 'Expire aujourd’hui' }
  if (daysLeft <= CERT_CRITICAL_DAYS) {
    return { level: 'danger', daysLeft, label: `Expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}` }
  }
  if (daysLeft <= CERT_WARNING_DAYS) {
    return { level: 'warning', daysLeft, label: `Expire dans ${daysLeft} jours` }
  }
  return { level: 'ok', daysLeft, label: `Expire dans ${daysLeft} jours` }
}

export interface CertificateEntry {
  id: string
  hostname: string
  /** Nom du projet (facultatif, pour le contexte affiché). */
  projectName?: string | null
  kind: 'project' | 'domain'
  expiresAt: Date | string | null
}

export interface CertificateSummary {
  level: HealthLevel
  total: number
  /** Certificats déjà expirés. */
  expired: number
  /** Certificats expirant dans les 7 jours. */
  critical: number
  /** Certificats expirant entre 8 et 30 jours. */
  warning: number
  /** Les plus urgents d'abord (expirés, critiques, puis à surveiller). */
  soon: Array<CertificateEntry & { risk: CertificateRisk }>
}

/** Synthèse des certificats suivis (`Project.tlsExpiresAt`, `ProjectDomain.tlsExpiresAt`). */
export function summarizeCertificates(
  entries: readonly CertificateEntry[],
  now: number = Date.now(),
  limit = 10,
): CertificateSummary {
  const withRisk = entries
    .map((entry) => ({ ...entry, risk: certificateRisk(entry.expiresAt, now) }))
    .sort((a, b) => {
      const left = a.risk.daysLeft ?? Number.POSITIVE_INFINITY
      const right = b.risk.daysLeft ?? Number.POSITIVE_INFINITY
      return left - right
    })

  const expired = withRisk.filter((item) => item.risk.daysLeft !== null && item.risk.daysLeft < 0).length
  const critical = withRisk.filter(
    (item) => item.risk.daysLeft !== null && item.risk.daysLeft >= 0 && item.risk.daysLeft <= CERT_CRITICAL_DAYS,
  ).length
  const warning = withRisk.filter(
    (item) => item.risk.daysLeft !== null && item.risk.daysLeft > CERT_CRITICAL_DAYS && item.risk.daysLeft <= CERT_WARNING_DAYS,
  ).length

  const soon = withRisk
    .filter((item) => item.risk.level === 'danger' || item.risk.level === 'warning')
    .slice(0, Math.max(0, limit))

  return {
    level: withRisk.length === 0 ? 'unknown' : worstLevel(withRisk.map((item) => item.risk.level)),
    total: withRisk.length,
    expired,
    critical,
    warning,
    soon,
  }
}

/* ------------------------------------------------------------------ */
/* Base de données                                                     */
/* ------------------------------------------------------------------ */

/** Seuils d'occupation des connexions PostgreSQL. */
export const CONNECTION_WARNING_RATIO = 0.7
export const CONNECTION_DANGER_RATIO = 0.9

export function connectionLevel(connections: number | null, maxConnections: number | null): HealthLevel {
  if (connections === null || maxConnections === null || maxConnections <= 0) return 'unknown'
  const ratio = connections / maxConnections
  if (ratio >= CONNECTION_DANGER_RATIO) return 'danger'
  if (ratio >= CONNECTION_WARNING_RATIO) return 'warning'
  return 'ok'
}

export interface DatabaseStatsInput {
  sizeBytes: number | null
  connections: number | null
  activeConnections: number | null
  idleConnections: number | null
  maxConnections: number | null
  latencyMs: number | null
}

/* ------------------------------------------------------------------ */
/* File de déploiements                                                */
/* ------------------------------------------------------------------ */

/** Compteurs BullMQ (toutes les files confondues, une seule file en pratique). */
export interface QueueCounts {
  waiting: number
  active: number
  delayed: number
  failed: number
  completed: number
  paused: number
}

function toCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

/** Normalise la réponse `getJobCounts()` (valeurs possiblement absentes). */
export function normalizeQueueCounts(raw: unknown): QueueCounts {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    waiting: toCount(source.waiting),
    active: toCount(source.active),
    delayed: toCount(source.delayed),
    failed: toCount(source.failed),
    completed: toCount(source.completed),
    paused: toCount(source.paused),
  }
}

export const QUEUE_WAITING_WARNING = 10
export const QUEUE_WAITING_DANGER = 50

/** Une file qui s'accumule signale un worker arrêté ou saturé. */
export function queueLevel(counts: QueueCounts): HealthLevel {
  if (counts.waiting >= QUEUE_WAITING_DANGER) return 'danger'
  if (counts.waiting >= QUEUE_WAITING_WARNING) return 'warning'
  return 'ok'
}

export interface DeploymentSummary {
  byStatus: Record<string, number>
  total: number
  active: number
  queued: number
  live: number
  failed: number
}

/** Regroupe les compteurs `Deployment.groupBy(status)` pour la page d'administration. */
export function summarizeDeployments(counts: Readonly<Record<string, number>>): DeploymentSummary {
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const [status, count] of Object.entries(counts)) {
    const value = toCount(count)
    byStatus[status] = value
    total += value
  }
  const sum = (statuses: readonly string[]) => statuses.reduce((acc, status) => acc + (byStatus[status] ?? 0), 0)
  return {
    byStatus,
    total,
    active: sum(ACTIVE_DEPLOYMENT_STATUSES),
    queued: byStatus.queued ?? 0,
    live: byStatus.live ?? 0,
    failed: byStatus.failed ?? 0,
  }
}

/**
 * Déploiements bloqués : non terminaux et plus vieux que le délai du watchdog.
 * Un chiffre non nul est un incident (worker arrêté, Coolify muet).
 */
export function countStaleDeployments(
  rows: readonly { status: string; createdAt: Date | string }[],
  now: number,
  timeoutMs: number,
): number {
  let stale = 0
  for (const row of rows) {
    if (isTerminal(row.status)) continue
    const created = toEpoch(row.createdAt)
    if (created !== null && created <= now - timeoutMs) stale += 1
  }
  return stale
}

/* ------------------------------------------------------------------ */
/* Serveurs et métriques                                               */
/* ------------------------------------------------------------------ */

export interface ServerMetrics {
  /** Pourcentage d'utilisation, ou `null` quand l'API ne l'expose pas. */
  cpu: number | null
  memory: number | null
  disk: number | null
}

export const METRICS_WARNING_PERCENT = 80
export const METRICS_DANGER_PERCENT = 95

export function clampPercent(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.min(100, Math.round(parsed * 10) / 10)
}

export function percentLevel(percent: number | null): HealthLevel {
  if (percent === null) return 'unknown'
  if (percent >= METRICS_DANGER_PERCENT) return 'danger'
  if (percent >= METRICS_WARNING_PERCENT) return 'warning'
  return 'ok'
}

/** Convertit `{ used, total }`, `{ percentage }` ou un nombre en pourcentage. */
function asPercent(value: unknown): number | null {
  if (typeof value === 'number') return clampPercent(value)
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if ('percentage' in record) return clampPercent(record.percentage)
  if ('percent' in record) return clampPercent(record.percent)
  const used = Number(record.used)
  const total = Number(record.total)
  if (Number.isFinite(used) && Number.isFinite(total) && total > 0) return clampPercent((used / total) * 100)
  return null
}

function readMetric(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (!(key in source)) continue
    const percent = asPercent(source[key])
    if (percent !== null) return percent
  }
  return null
}

/**
 * Extraction tolérante des métriques d'un serveur Coolify.
 *
 * Coolify 4.6 n'expose **pas** CPU/mémoire/disque dans `GET /servers` (les
 * relevés passent par Sentinel) : la fonction renvoie alors `null` partout et
 * l'interface affiche « non exposé par l'API » plutôt qu'une valeur inventée.
 */
export function extractServerMetrics(input: unknown): ServerMetrics {
  if (!input || typeof input !== 'object') return { cpu: null, memory: null, disk: null }
  const record = input as Record<string, unknown>
  const nested = (record.metrics && typeof record.metrics === 'object' ? record.metrics : {}) as Record<string, unknown>
  const settings = (record.settings && typeof record.settings === 'object' ? record.settings : {}) as Record<string, unknown>

  const cpu = readMetric(nested, ['cpu', 'cpu_usage', 'cpuUsage', 'load']) ?? readMetric(record, ['cpu_usage', 'cpuUsage', 'cpu', 'cpu_percent'])
  const memory =
    readMetric(nested, ['memory', 'memory_usage', 'memoryUsage', 'mem']) ??
    readMetric(record, ['memory_usage', 'memoryUsage', 'memory', 'mem_usage'])
  const disk =
    readMetric(nested, ['disk', 'disk_usage', 'diskUsage']) ??
    readMetric(record, ['disk_usage', 'diskUsage', 'disk']) ??
    readMetric(settings, ['disk_usage', 'diskUsage'])

  return { cpu, memory, disk }
}

/* ------------------------------------------------------------------ */
/* Applications orphelines                                             */
/* ------------------------------------------------------------------ */

export interface ApplicationRef {
  id: string
  name: string
  status?: string | null
  serverUuid?: string | null
}

/** Applications présentes côté Coolify mais liées à aucun projet Eflex. */
export function orphanApplications(
  applications: readonly ApplicationRef[],
  knownAppIds: Iterable<string>,
): ApplicationRef[] {
  const known = new Set(knownAppIds)
  return applications.filter((application) => application.id.length > 0 && !known.has(application.id))
}

/* ------------------------------------------------------------------ */
/* Erreurs et formatage                                                */
/* ------------------------------------------------------------------ */

export type SourceErrorKind = 'unconfigured' | 'timeout' | 'unauthorized' | 'unreachable' | 'http' | 'unknown'

export const SOURCE_ERROR_LABELS: Record<SourceErrorKind, string> = {
  unconfigured: 'Non configuré',
  timeout: 'Délai dépassé',
  unauthorized: 'Authentification refusée',
  unreachable: 'Injoignable',
  http: 'Réponse en erreur',
  unknown: 'Erreur inconnue',
}

/** Retire tout identifiant d'URL, jeton ou en-tête avant affichage. */
export function sanitizeErrorText(raw: unknown): string {
  const text =
    typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : raw === null || raw === undefined ? '' : String(raw)
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [masqué]')
    .replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[masqué]@')
    .replace(/([?&](?:token|key|secret|password|api_key)=)[^&\s]+/gi, '$1[masqué]')
    .trim()
    .slice(0, 300)
}

/** Traduit une erreur technique en catégorie affichable (couleur et libellé). */
export function classifySourceError(raw: unknown): {
  kind: SourceErrorKind
  label: string
  detail: string
} {
  const detail = sanitizeErrorText(raw)
  const haystack = detail.toLowerCase()

  let kind: SourceErrorKind = 'unknown'
  if (/non configur|absent|manquant/.test(haystack)) kind = 'unconfigured'
  else if (/délai dépassé|timeout|timed out|aborted|abort/.test(haystack)) kind = 'timeout'
  else if (/\b40[13]\b|unauthenticated|unauthorized|invalid token|jeton/.test(haystack)) kind = 'unauthorized'
  else if (/injoignable|fetch failed|econnrefused|econnreset|enotfound|eai_again|network|socket|connect/.test(haystack)) {
    kind = 'unreachable'
  } else if (/\b(?:http|api)\s?(?:5\d\d|4\d\d)\b|réponse \d{3}/.test(haystack)) kind = 'http'

  return { kind, label: SOURCE_ERROR_LABELS[kind], detail }
}

const BYTE_UNITS = ['o', 'ko', 'Mo', 'Go', 'To'] as const

/** Taille lisible en français (`null` → tiret cadratin). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${BYTE_UNITS[unit]}`
}

/** Latence en millisecondes, ou tiret si la mesure a échoué. */
export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`
}
