/**
 * Collecte de l'état de l'infrastructure pour `/admin/infrastructure` (issue 31).
 *
 * Chaque source est interrogée **en parallèle** avec un délai court et son
 * erreur est capturée séparément : un Coolify muet, Redis arrêté ou une base
 * lente n'empêchent jamais le reste de la page de s'afficher. Les messages
 * d'erreur sont expurgés (jeton, identifiants d'URL) avant de quitter le
 * serveur, et le jeton Coolify n'est jamais renvoyé.
 */
import { prisma } from '@/lib/prisma'
import { deploymentsQueue } from '@/lib/queue'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { deploymentTimeoutMs } from '@/lib/deployment-watchdog'
import {
  DEFAULT_PLATFORM_SETTINGS,
  readPlatformSettings,
  type PlatformSettingsSnapshot,
} from '@/lib/platform-settings'
import {
  classifySourceError,
  connectionLevel,
  countStaleDeployments,
  extractServerMetrics,
  normalizeQueueCounts,
  overallHealth,
  orphanApplications,
  percentLevel,
  queueLevel,
  sanitizeErrorText,
  summarizeCertificates,
  summarizeDeployments,
  worstLevel,
  type ApplicationRef,
  type CertificateSummary,
  type DatabaseStatsInput,
  type DeploymentSummary,
  type HealthLevel,
  type QueueCounts,
  type ServerMetrics,
  type SourceErrorKind,
} from '@/lib/infrastructure-health'

const COOLIFY_URL = (process.env.COOLIFY_API_URL ?? '').replace(/\/$/, '')
const COOLIFY_TOKEN = process.env.COOLIFY_API_TOKEN ?? ''
const COOLIFY_CONFIGURED = Boolean(COOLIFY_URL && COOLIFY_TOKEN)

/** Délais courts : la page doit répondre vite même quand une source est morte. */
const PROBE_TIMEOUT_MS = 2_500
const LIST_TIMEOUT_MS = 4_000
const RESOURCES_TIMEOUT_MS = 3_500
const DATABASE_TIMEOUT_MS = 4_000
const QUEUE_TIMEOUT_MS = 3_000

export type SourceKey =
  | 'coolify'
  | 'database'
  | 'certificates'
  | 'deployments'
  | 'queue'
  | 'settings'

export interface SourceInfo {
  key: SourceKey
  label: string
  level: HealthLevel
  latencyMs: number | null
  /** Message expurgé, sans jeton ni identifiant d'URL. */
  error: string | null
  errorKind: SourceErrorKind | null
  checkedAt: string
}

export interface CoolifyServerView {
  uuid: string
  name: string
  ip: string | null
  reachable: boolean | null
  role: string | null
  dockerVersion: string | null
  applications: number | null
  databases: number | null
  metrics: ServerMetrics
  metricsLevel: HealthLevel
}

export interface CoolifySnapshot {
  configured: boolean
  reachable: boolean
  version: string | null
  latencyMs: number | null
  lastResponseAt: string | null
  servers: CoolifyServerView[]
  applications: ApplicationRef[]
  level: HealthLevel
  error: string | null
  errorKind: SourceErrorKind | null
}

export interface DatabaseSnapshot extends DatabaseStatsInput {
  level: HealthLevel
  error: string | null
  errorKind: SourceErrorKind | null
}

export interface DeploymentsSnapshot {
  summary: DeploymentSummary
  stale: number
  timeoutMinutes: number
  level: HealthLevel
  error: string | null
  errorKind: SourceErrorKind | null
}

export interface QueueSnapshot {
  counts: QueueCounts | null
  level: HealthLevel
  latencyMs: number | null
  error: string | null
  errorKind: SourceErrorKind | null
}

export interface CertificatesSnapshot extends CertificateSummary {
  error: string | null
  errorKind: SourceErrorKind | null
}

export interface ProjectsSnapshot {
  total: number
  withApplication: number
  orphans: ApplicationRef[]
  error: string | null
}

interface ProjectsAttempt extends Omit<ProjectsSnapshot, 'orphans'> {
  appIds: string[]
}

export interface InfrastructureSnapshot {
  collectedAt: string
  durationMs: number
  overall: HealthLevel
  coolify: CoolifySnapshot
  database: DatabaseSnapshot
  deployments: DeploymentsSnapshot
  queue: QueueSnapshot
  certificates: CertificatesSnapshot
  projects: ProjectsSnapshot
  settings: PlatformSettingsSnapshot
  sources: SourceInfo[]
}

interface Attempt<T> {
  ok: boolean
  value: T | null
  latencyMs: number
  error: string | null
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} : délai dépassé (${ms} ms).`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function measure<T>(label: string, run: () => Promise<T>): Promise<Attempt<T>> {
  const started = Date.now()
  try {
    const value = await run()
    return { ok: true, value, latencyMs: Date.now() - started, error: null }
  } catch (error) {
    return { ok: false, value: null, latencyMs: Date.now() - started, error: sanitizeErrorText(error) }
  }
}

function errorKindOf(error: string | null): SourceErrorKind | null {
  return error ? classifySourceError(error).kind : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/* ------------------------------------------------------------------ */
/* Coolify                                                             */
/* ------------------------------------------------------------------ */

/** `GET /health` renvoie du texte brut, pas du JSON. */
async function coolifyHealthProbe(): Promise<boolean> {
  const response = await fetch(`${COOLIFY_URL}/health`, {
    headers: { Authorization: `Bearer ${COOLIFY_TOKEN}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })
  return response.ok
}

/**
 * `GET /version` renvoie selon les versions du texte brut (`4.7.3`) ou du JSON
 * (`{"version":"4.7.3"}`) : on accepte les deux plutôt que d'échouer sur le
 * parsing JSON.
 */
async function coolifyVersionProbe(): Promise<string | null> {
  const response = await fetch(`${COOLIFY_URL}/version`, {
    headers: { Authorization: `Bearer ${COOLIFY_TOKEN}`, Accept: 'application/json, text/plain' },
    cache: 'no-store',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Hébergement API ${response.status} : version indisponible.`)
  const raw = (await response.text()).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { version?: unknown }
    return text(parsed.version) ?? raw.slice(0, 40)
  } catch {
    return raw.slice(0, 40)
  }
}

async function coolifyGet<T>(path: string, timeoutMs: number): Promise<T> {
  if (!COOLIFY_CONFIGURED) {
    throw new Error('Service de déploiement non configuré (COOLIFY_API_URL et COOLIFY_API_TOKEN absents).')
  }
  const response = await fetch(`${COOLIFY_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${COOLIFY_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    let message = body.slice(0, 200)
    try {
      const parsed = JSON.parse(body) as { message?: unknown }
      if (typeof parsed.message === 'string') message = parsed.message
    } catch {
      // Réponse non JSON : texte brut conservé.
    }
    throw new Error(`Hébergement API ${response.status}${message ? ` : ${message}` : ''}`)
  }
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    return undefined as T
  }
}

function applicationRef(raw: unknown): ApplicationRef | null {
  const item = record(raw)
  const id = text(item.uuid) ?? text(item.id)
  if (!id) return null
  const destination = record(item.destination)
  const server = record(destination.server)
  return {
    id,
    name: text(item.name) ?? id,
    status: text(item.status),
    serverUuid: text(server.uuid) ?? text(item.server_uuid) ?? null,
  }
}

function serverView(
  raw: unknown,
  applications: readonly ApplicationRef[],
  resources: unknown,
  singleServer: boolean,
): CoolifyServerView | null {
  const item = record(raw)
  const uuid = text(item.uuid) ?? text(item.id)
  if (!uuid) return null

  const settings = record(item.settings)
  const metrics = extractServerMetrics(item)
  const metricsLevel = worstLevel([percentLevel(metrics.cpu), percentLevel(metrics.memory), percentLevel(metrics.disk)])

  const perServer = applications.filter((application) => application.serverUuid === uuid).length
  const mapped = applications.some((application) => application.serverUuid !== null)
  // Une seule machine déclarée : toutes les applications y tournent, même si
  // l'API n'expose pas le serveur de chaque application.
  const applicationsOnServer = mapped ? perServer : singleServer ? applications.length : null

  let databases: number | null = null
  if (Array.isArray(resources)) {
    databases = resources.filter((entry) => {
      const type = (text(record(entry).type) ?? text(record(entry).type_name) ?? '').toLowerCase()
      return type.includes('database')
    }).length
  }

  return {
    uuid,
    name: text(item.name) ?? uuid,
    ip: text(item.ip),
    reachable: typeof settings.is_reachable === 'boolean' ? settings.is_reachable : null,
    role: text(settings.server_role),
    dockerVersion: text(settings.docker_version),
    applications: applicationsOnServer,
    databases,
    metrics,
    metricsLevel,
  }
}

async function collectCoolify(): Promise<CoolifySnapshot> {
  if (!COOLIFY_CONFIGURED) {
    return {
      configured: false,
      reachable: false,
      version: null,
      latencyMs: null,
      lastResponseAt: null,
      servers: [],
      applications: [],
      level: 'unknown',
      error: 'COOLIFY_API_URL et COOLIFY_API_TOKEN ne sont pas définis : l’état de l’hébergement est inconnu.',
      errorKind: 'unconfigured',
    }
  }

  const [healthAttempt, versionAttempt] = await Promise.all([
    measure('Santé Coolify', coolifyHealthProbe),
    measure('Version Coolify', coolifyVersionProbe),
  ])

  const reachable = healthAttempt.ok || versionAttempt.ok
  const latencyMs = versionAttempt.ok ? versionAttempt.latencyMs : healthAttempt.latencyMs
  const version = versionAttempt.value ?? null

  if (!reachable) {
    const error = healthAttempt.error ?? versionAttempt.error ?? 'Hébergement injoignable.'
    return {
      configured: true,
      reachable: false,
      version: null,
      latencyMs: healthAttempt.latencyMs,
      lastResponseAt: null,
      servers: [],
      applications: [],
      level: 'danger',
      error,
      errorKind: errorKindOf(error),
    }
  }

  const [serversAttempt, applicationsAttempt] = await Promise.all([
    measure('Liste des serveurs', () => coolifyGet<unknown[]>('/servers', LIST_TIMEOUT_MS)),
    measure('Liste des applications', () => coolifyGet<unknown[]>('/applications', LIST_TIMEOUT_MS)),
  ])

  const applications = (applicationsAttempt.value ?? [])
    .map(applicationRef)
    .filter((application): application is ApplicationRef => application !== null)

  const rawServers = Array.isArray(serversAttempt.value) ? serversAttempt.value : []
  const resourceAttempts = await Promise.all(
    rawServers.map((server) => {
      const uuid = text(record(server).uuid) ?? text(record(server).id)
      if (!uuid) return Promise.resolve<Attempt<unknown>>({ ok: false, value: null, latencyMs: 0, error: null })
      return measure('Ressources du serveur', () =>
        coolifyGet<unknown[]>(`/servers/${encodeURIComponent(uuid)}/resources`, RESOURCES_TIMEOUT_MS),
      )
    }),
  )

  const servers = rawServers
    .map((server, index) =>
      serverView(server, applications, resourceAttempts[index]?.value ?? null, rawServers.length === 1),
    )
    .filter((server): server is CoolifyServerView => server !== null)

  const partialError = serversAttempt.error ?? applicationsAttempt.error
  const level: HealthLevel = partialError
    ? 'warning'
    : servers.length === 0
      ? 'warning'
      : worstLevel(servers.map((server) => (server.reachable === false ? 'danger' : 'ok')))

  return {
    configured: true,
    reachable: true,
    version,
    latencyMs,
    lastResponseAt: new Date().toISOString(),
    servers,
    applications,
    level,
    error: partialError,
    errorKind: errorKindOf(partialError),
  }
}

/* ------------------------------------------------------------------ */
/* Base de données                                                     */
/* ------------------------------------------------------------------ */

async function collectDatabase(): Promise<DatabaseSnapshot> {
  const empty: DatabaseSnapshot = {
    sizeBytes: null,
    connections: null,
    activeConnections: null,
    idleConnections: null,
    maxConnections: null,
    latencyMs: null,
    level: 'unknown',
    error: null,
    errorKind: null,
  }

  const attempt = await measure('Base de données', () =>
    withTimeout(
      (async () => {
        const [sizeRow] = await prisma.$queryRaw<Array<{ size: bigint | number }>>`
          SELECT pg_database_size(current_database()) AS size
        `
        const [activityRow] = await prisma.$queryRaw<
          Array<{ total: bigint | number; active: bigint | number; idle: bigint | number }>
        >`
          SELECT
            count(*) AS total,
            count(*) FILTER (WHERE state = 'active') AS active,
            count(*) FILTER (WHERE state = 'idle') AS idle
          FROM pg_stat_activity
          WHERE datname = current_database()
        `
        const [maxRow] = await prisma.$queryRaw<Array<{ max_connections: number | string }>>`
          SELECT setting::int AS max_connections FROM pg_settings WHERE name = 'max_connections'
        `
        return { sizeRow, activityRow, maxRow }
      })(),
      DATABASE_TIMEOUT_MS,
      'Base de données',
    ),
  )

  if (!attempt.ok || !attempt.value) {
    return {
      ...empty,
      latencyMs: attempt.latencyMs,
      level: 'danger',
      error: attempt.error ?? 'Base de données injoignable.',
      errorKind: errorKindOf(attempt.error),
    }
  }

  const connections = toNumber(attempt.value.activityRow?.total)
  const maxConnections = toNumber(attempt.value.maxRow?.max_connections)

  return {
    sizeBytes: toNumber(attempt.value.sizeRow?.size),
    connections,
    activeConnections: toNumber(attempt.value.activityRow?.active),
    idleConnections: toNumber(attempt.value.activityRow?.idle),
    maxConnections,
    latencyMs: attempt.latencyMs,
    level: connectionLevel(connections, maxConnections),
    error: null,
    errorKind: null,
  }
}

/* ------------------------------------------------------------------ */
/* Déploiements et projets                                             */
/* ------------------------------------------------------------------ */

async function collectDeployments(): Promise<DeploymentsSnapshot> {
  const timeoutMinutes = Math.max(1, Math.round(deploymentTimeoutMs() / 60_000))
  const attempt = await measure('Déploiements', () =>
    withTimeout(
      (async () => {
        const grouped = await prisma.deployment.groupBy({ by: ['status'], _count: { _all: true } })
        const active = await prisma.deployment.findMany({
          where: { status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
          select: { status: true, createdAt: true },
          take: 500,
        })
        return { grouped, active }
      })(),
      DATABASE_TIMEOUT_MS,
      'Déploiements',
    ),
  )

  if (!attempt.ok || !attempt.value) {
    return {
      summary: summarizeDeployments({}),
      stale: 0,
      timeoutMinutes,
      level: 'unknown',
      error: attempt.error ?? 'Compteurs de déploiements indisponibles.',
      errorKind: errorKindOf(attempt.error),
    }
  }

  const counts: Record<string, number> = {}
  for (const row of attempt.value.grouped) counts[row.status] = row._count._all
  const stale = countStaleDeployments(attempt.value.active, Date.now(), deploymentTimeoutMs())
  const summary = summarizeDeployments(counts)

  return {
    summary,
    stale,
    timeoutMinutes,
    level: stale > 0 ? 'danger' : 'ok',
    error: null,
    errorKind: null,
  }
}

async function collectProjects(): Promise<ProjectsAttempt> {
  const attempt = await measure('Projets', () =>
    withTimeout(
      prisma.project.findMany({ select: { coolifyAppId: true } }),
      DATABASE_TIMEOUT_MS,
      'Projets',
    ),
  )
  if (!attempt.ok || !attempt.value) {
    return {
      total: 0,
      withApplication: 0,
      appIds: [],
      error: attempt.error ?? 'Projets indisponibles.',
    }
  }
  const appIds = attempt.value
    .map((project) => project.coolifyAppId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return { total: attempt.value.length, withApplication: appIds.length, appIds, error: null }
}

/* ------------------------------------------------------------------ */
/* File de déploiements                                                */
/* ------------------------------------------------------------------ */

async function collectQueue(): Promise<QueueSnapshot> {
  if (!process.env.REDIS_URL) {
    return {
      counts: null,
      level: 'unknown',
      latencyMs: null,
      error: 'REDIS_URL est absente : la file de déploiements n’est pas supervisable.',
      errorKind: 'unconfigured',
    }
  }

  const attempt = await measure('File de déploiements', () =>
    withTimeout(deploymentsQueue().getJobCounts(), QUEUE_TIMEOUT_MS, 'File de déploiements'),
  )
  if (!attempt.ok || !attempt.value) {
    return {
      counts: null,
      level: 'danger',
      latencyMs: attempt.latencyMs,
      error: attempt.error ?? 'File de déploiements injoignable.',
      errorKind: errorKindOf(attempt.error),
    }
  }
  const counts = normalizeQueueCounts(attempt.value)
  return {
    counts,
    level: queueLevel(counts),
    latencyMs: attempt.latencyMs,
    error: null,
    errorKind: null,
  }
}

/* ------------------------------------------------------------------ */
/* Certificats                                                         */
/* ------------------------------------------------------------------ */

async function collectCertificates(): Promise<CertificatesSnapshot> {
  const attempt = await measure('Certificats', () =>
    withTimeout(
      (async () => {
        const [projects, domains] = await Promise.all([
          prisma.project.findMany({
            where: { tlsExpiresAt: { not: null } },
            select: { id: true, name: true, domain: true, tlsExpiresAt: true },
            orderBy: { tlsExpiresAt: 'asc' },
            take: 500,
          }),
          prisma.projectDomain.findMany({
            where: { tlsExpiresAt: { not: null }, verifiedAt: { not: null } },
            select: {
              id: true,
              hostname: true,
              tlsExpiresAt: true,
              project: { select: { name: true } },
            },
            orderBy: { tlsExpiresAt: 'asc' },
            take: 500,
          }),
        ])
        return { projects, domains }
      })(),
      DATABASE_TIMEOUT_MS,
      'Certificats',
    ),
  )

  if (!attempt.ok || !attempt.value) {
    return {
      level: 'unknown',
      total: 0,
      expired: 0,
      critical: 0,
      warning: 0,
      soon: [],
      error: attempt.error ?? 'Certificats indisponibles.',
      errorKind: errorKindOf(attempt.error),
    }
  }

  const summary = summarizeCertificates([
    ...attempt.value.projects.map((project) => ({
      id: project.id,
      hostname: project.domain ?? project.name,
      projectName: project.name,
      kind: 'project' as const,
      expiresAt: project.tlsExpiresAt,
    })),
    ...attempt.value.domains.map((domain) => ({
      id: domain.id,
      hostname: domain.hostname,
      projectName: domain.project?.name ?? null,
      kind: 'domain' as const,
      expiresAt: domain.tlsExpiresAt,
    })),
  ])

  return { ...summary, error: null, errorKind: null }
}

async function collectSettings(): Promise<PlatformSettingsSnapshot> {
  const attempt = await measure('Réglages', () =>
    withTimeout(readPlatformSettings(), DATABASE_TIMEOUT_MS, 'Réglages'),
  )
  if (!attempt.ok || !attempt.value) {
    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS, maintenanceEnabled: process.env.MAINTENANCE_MODE === 'true' },
      source: 'environment',
      maintenanceForced: process.env.MAINTENANCE_MODE === 'true',
      error: attempt.error ?? 'Réglages indisponibles.',
    }
  }
  return attempt.value
}

/* ------------------------------------------------------------------ */
/* Agrégation                                                          */
/* ------------------------------------------------------------------ */

function sourceInfo(
  key: SourceKey,
  label: string,
  level: HealthLevel,
  latencyMs: number | null,
  error: string | null,
  checkedAt: string,
): SourceInfo {
  return { key, label, level, latencyMs, error, errorKind: errorKindOf(error), checkedAt }
}

/** Interroge toutes les sources en parallèle et renvoie un instantané sérialisable. */
export async function collectInfrastructure(): Promise<InfrastructureSnapshot> {
  const started = Date.now()
  const collectedAt = new Date(started).toISOString()

  const [coolify, database, deployments, projectsAttempt, queue, certificates, settings] = await Promise.all([
    collectCoolify(),
    collectDatabase(),
    collectDeployments(),
    collectProjects(),
    collectQueue(),
    collectCertificates(),
    collectSettings(),
  ])

  // Applications présentes côté Coolify mais liées à aucun projet Eflex.
  // Base injoignable : on ne peut pas savoir, donc on n'accuse aucune application.
  const projects: ProjectsSnapshot = {
    total: projectsAttempt.total,
    withApplication: projectsAttempt.withApplication,
    orphans: projectsAttempt.error ? [] : orphanApplications(coolify.applications, projectsAttempt.appIds),
    error: projectsAttempt.error,
  }

  const sources: SourceInfo[] = [
    sourceInfo('coolify', 'Hébergement Coolify', coolify.level, coolify.latencyMs, coolify.error, collectedAt),
    sourceInfo('database', 'Base de données', database.level, database.latencyMs, database.error, collectedAt),
    sourceInfo('certificates', 'Certificats TLS', certificates.level, null, certificates.error, collectedAt),
    sourceInfo(
      'deployments',
      'Déploiements',
      worstLevel([deployments.level, projects.error ? 'warning' : 'ok']),
      null,
      deployments.error ?? projects.error,
      collectedAt,
    ),
    sourceInfo('queue', 'File de déploiements', queue.level, queue.latencyMs, queue.error, collectedAt),
    sourceInfo(
      'settings',
      'Réglages de plateforme',
      settings.error ? 'warning' : 'ok',
      null,
      settings.error,
      collectedAt,
    ),
  ]

  return {
    collectedAt,
    durationMs: Date.now() - started,
    overall: overallHealth(sources.map((source) => source.level)),
    coolify,
    database,
    deployments,
    queue,
    certificates,
    projects,
    settings,
    sources,
  }
}

export interface InfrastructureSummary {
  collectedAt: string
  durationMs: number
  overall: HealthLevel
  sources: Array<{ key: SourceKey; label: string; level: HealthLevel; latencyMs: number | null; detail: string | null }>
  counts: {
    servers: number
    applications: number
    orphanApplications: number
    deploymentsActive: number
    deploymentsStale: number
    queueWaiting: number
    certificatesExpiring: number
  }
}

/** Résumé compact renvoyé par `POST /api/admin/infrastructure/check`. */
export function summarizeInfrastructure(snapshot: InfrastructureSnapshot): InfrastructureSummary {
  return {
    collectedAt: snapshot.collectedAt,
    durationMs: snapshot.durationMs,
    overall: snapshot.overall,
    sources: snapshot.sources.map((source) => ({
      key: source.key,
      label: source.label,
      level: source.level,
      latencyMs: source.latencyMs,
      detail: source.error,
    })),
    counts: {
      servers: snapshot.coolify.servers.length,
      applications: snapshot.coolify.applications.length,
      orphanApplications: snapshot.projects.orphans.length,
      deploymentsActive: snapshot.deployments.summary.active,
      deploymentsStale: snapshot.deployments.stale,
      queueWaiting: snapshot.queue.counts?.waiting ?? 0,
      certificatesExpiring: snapshot.certificates.critical + snapshot.certificates.warning,
    },
  }
}
