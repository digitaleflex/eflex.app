import { coolifyFetch } from '@/lib/coolify'

/**
 * Pilotage de Coolify depuis l'administration E-FLEX (réservé à l'exploitant).
 *
 * But : ne plus ouvrir l'interface de Coolify que pour une urgence. Chaque réponse est relue par un
 * lecteur strict qui ne garde que les champs utiles : aucun secret (jetons Sentinel, clés S3, sorties
 * brutes de commandes, journaux de build) ne repart vers le navigateur. Inventaire complet de l'API :
 * `docs/architecture/coolify-api-capacites.md`.
 */

type Result<T> = T | { error: string }

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const bool = (value: unknown): boolean => value === true || value === 1 || value === '1'
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})
const enc = encodeURIComponent

/* ------------------------------------------------------------------ */
/* Serveur : proxy, nettoyage Docker, analyse d'images, validation      */
/* ------------------------------------------------------------------ */

export interface ServerProxy {
  type: string | null
  status: string | null
}

export interface DockerCleanupSettings {
  frequency: string
  threshold: number
  force: boolean
  deleteUnusedVolumes: boolean
  deleteUnusedNetworks: boolean
}

export interface DockerCleanupExecution {
  id: string
  status: string
  createdAt: string
  finishedAt: string | null
  /** Message court de Coolify (tronqué). */
  message: string | null
}

export interface ImageScanning {
  enabled: boolean
  state: string | null
  failedStep: string | null
}

export interface ServerControl {
  proxy: Result<ServerProxy>
  cleanup: Result<DockerCleanupSettings>
  cleanupExecutions: Result<DockerCleanupExecution[]>
  imageScanning: Result<ImageScanning>
}

export function parseProxy(raw: unknown): ServerProxy {
  const data = obj(raw)
  return { type: str(data.proxy_type), status: str(data.status) }
}

export function parseCleanup(raw: unknown): DockerCleanupSettings {
  const data = obj(raw)
  return {
    frequency: str(data.docker_cleanup_frequency) ?? '',
    threshold: num(data.docker_cleanup_threshold) ?? 0,
    force: bool(data.force_docker_cleanup),
    deleteUnusedVolumes: bool(data.delete_unused_volumes),
    deleteUnusedNetworks: bool(data.delete_unused_networks),
  }
}

export function parseCleanupExecutions(raw: unknown, limit = 10): DockerCleanupExecution[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const data = obj(item)
      const id = str(data.uuid)
      if (!id) return null
      const message = str(data.message)
      return {
        id,
        status: str(data.status) ?? 'unknown',
        createdAt: str(data.created_at) ?? '',
        finishedAt: str(data.finished_at),
        message: message ? message.slice(0, 300) : null,
      }
    })
    .filter((item): item is DockerCleanupExecution => item !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export function parseImageScanning(raw: unknown): ImageScanning {
  const data = obj(raw)
  return {
    enabled: bool(data.is_image_scan_enabled),
    state: str(data.scanner_state),
    failedStep: str(data.scanner_failed_step),
  }
}

async function read<T>(path: string, parse: (raw: unknown) => T, timeoutMs = 8_000): Promise<Result<T>> {
  const res = await coolifyFetch<unknown>(path, { signal: AbortSignal.timeout(timeoutMs) })
  if (res.error) return { error: res.error }
  return parse(res.data)
}

async function send(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<{ ok: true; message: string | null } | { error: string }> {
  const res = await coolifyFetch<{ message?: unknown }>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (res.error) return { error: res.error }
  return { ok: true, message: str(res.data?.message) }
}

export async function getServerControl(serverUuid: string): Promise<ServerControl> {
  const base = `/servers/${enc(serverUuid)}`
  const [proxy, cleanup, cleanupExecutions, imageScanning] = await Promise.all([
    read(`${base}/proxy`, parseProxy),
    read(`${base}/docker-cleanup`, parseCleanup),
    read(`${base}/docker-cleanup/executions`, (raw) => parseCleanupExecutions(raw)),
    read(`${base}/image-scanning`, parseImageScanning),
  ])
  return { proxy, cleanup, cleanupExecutions, imageScanning }
}

export type ServerAction =
  | { action: 'proxy-restart' }
  | { action: 'cleanup-run'; deleteUnusedVolumes: boolean; deleteUnusedNetworks: boolean }
  | { action: 'validate' }
  | { action: 'image-scan'; enabled: boolean }

export async function runServerAction(serverUuid: string, input: ServerAction) {
  const base = `/servers/${enc(serverUuid)}`
  switch (input.action) {
    case 'proxy-restart':
      return send(`${base}/proxy/restart`, 'POST')
    case 'cleanup-run':
      return send(`${base}/docker-cleanup/run`, 'POST', {
        delete_unused_volumes: input.deleteUnusedVolumes,
        delete_unused_networks: input.deleteUnusedNetworks,
      })
    case 'validate':
      return send(`${base}/validate`, 'POST', { install: false })
    case 'image-scan':
      return send(`${base}/image-scanning`, 'PATCH', { is_image_scan_enabled: input.enabled })
  }
}

export async function updateDockerCleanup(
  serverUuid: string,
  input: Partial<Pick<DockerCleanupSettings, 'frequency' | 'threshold' | 'deleteUnusedVolumes' | 'deleteUnusedNetworks'>>,
) {
  const body: Record<string, unknown> = {}
  if (input.frequency !== undefined) body.docker_cleanup_frequency = input.frequency
  if (input.threshold !== undefined) body.docker_cleanup_threshold = input.threshold
  if (input.deleteUnusedVolumes !== undefined) body.delete_unused_volumes = input.deleteUnusedVolumes
  if (input.deleteUnusedNetworks !== undefined) body.delete_unused_networks = input.deleteUnusedNetworks
  return send(`/servers/${enc(serverUuid)}/docker-cleanup`, 'PATCH', body)
}

/* ------------------------------------------------------------------ */
/* Stockages S3 (destinations des sauvegardes)                          */
/* ------------------------------------------------------------------ */

export interface S3StorageView {
  id: string
  name: string
  endpoint: string
  bucket: string | null
  region: string | null
}

export function parseS3Storages(raw: unknown): S3StorageView[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const data = obj(item)
      const id = str(data.uuid)
      if (!id) return null
      // Les clés d'accès ne sont jamais gardées, même si Coolify les renvoyait.
      return {
        id,
        name: str(data.name) ?? id,
        endpoint: str(data.endpoint) ?? '',
        bucket: str(data.bucket),
        region: str(data.region),
      }
    })
    .filter((item): item is S3StorageView => item !== null)
}

export const listS3Storages = () => read('/s3-storages', parseS3Storages)

export async function validateS3Storage(id: string): Promise<{ valid: boolean; message: string | null } | { error: string }> {
  const res = await coolifyFetch<{ valid?: unknown; message?: unknown }>(`/s3-storages/${enc(id)}/validate`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })
  if (res.error) return { error: res.error }
  return { valid: res.data?.valid === true, message: str(res.data?.message) }
}

export interface S3StorageInput {
  name: string
  endpoint: string
  bucket: string
  region: string
  key: string
  secret: string
}

/** Déclare un stockage S3 dans Coolify. Les clés transitent vers Coolify et ne sont jamais conservées par E-FLEX. */
export async function createS3Storage(input: S3StorageInput): Promise<{ id: string } | { error: string }> {
  const res = await coolifyFetch<{ uuid?: unknown }>('/s3-storages', {
    method: 'POST',
    body: JSON.stringify({
      type: 's3',
      name: input.name,
      endpoint: input.endpoint,
      bucket: input.bucket,
      region: input.region,
      key: input.key,
      secret: input.secret,
    }),
  })
  if (res.error) return { error: res.error }
  const id = str(res.data?.uuid)
  return id ? { id } : { error: "L'hébergement n'a pas renvoyé l'identifiant du stockage." }
}

/* ------------------------------------------------------------------ */
/* Sécurité : analyse des failles des images                           */
/* ------------------------------------------------------------------ */

export interface VulnerabilityView {
  id: string
  name: string
  type: string
  status: string
  label: string | null
  action: string | null
  critical: number
  high: number
  medium: number
  exploited: number
  endOfLife: boolean
  checkedAt: string | null
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, ok: 4, clean: 4 }

export function parseVulnerabilities(raw: unknown): VulnerabilityView[] {
  const list = obj(raw).resources
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      const data = obj(item)
      const id = str(data.uuid)
      if (!id) return null
      const security = obj(data.security)
      return {
        id,
        name: str(data.name) ?? id,
        type: str(data.type) ?? 'resource',
        status: str(security.status) ?? 'unknown',
        label: str(security.label),
        action: str(security.action),
        critical: num(security.critical_count) ?? 0,
        high: num(security.high_count) ?? 0,
        medium: num(security.medium_count) ?? 0,
        exploited: num(security.exploited_count) ?? 0,
        endOfLife: bool(security.eol),
        checkedAt: str(security.checked_at),
      }
    })
    .filter((item): item is VulnerabilityView => item !== null)
    .sort(
      (a, b) =>
        b.exploited - a.exploited ||
        b.critical - a.critical ||
        b.high - a.high ||
        (SEVERITY_ORDER[a.status] ?? 5) - (SEVERITY_ORDER[b.status] ?? 5) ||
        a.name.localeCompare(b.name),
    )
}

export const listVulnerabilities = () => read('/vulnerabilities', parseVulnerabilities, 15_000)

/* ------------------------------------------------------------------ */
/* Journal d'audit de Coolify                                          */
/* ------------------------------------------------------------------ */

export const AUDIT_SOURCES = ['all', 'ui', 'api', 'mcp', 'webhook', 'system', 'scheduler'] as const
export type AuditSource = (typeof AUDIT_SOURCES)[number]

export interface CoolifyAuditEvent {
  id: number
  createdAt: string
  source: string
  action: string
  level: string
  actor: string | null
  resource: string | null
  description: string | null
}

export interface CoolifyAuditPage {
  events: CoolifyAuditEvent[]
  page: number
  lastPage: number
  total: number
}

export function parseAuditPage(raw: unknown): CoolifyAuditPage {
  const data = obj(raw)
  const events = (Array.isArray(data.data) ? data.data : [])
    .map((item) => {
      const row = obj(item)
      const id = num(row.id)
      if (id === null) return null
      return {
        id,
        createdAt: str(row.created_at) ?? '',
        source: str(row.source) ?? '',
        action: str(row.action) ?? str(row.event) ?? '',
        level: str(row.level) ?? 'info',
        actor: str(row.actor_name),
        resource: str(row.resource_name) ?? str(row.resource_type),
        description: str(row.description),
      }
    })
    .filter((item): item is CoolifyAuditEvent => item !== null)
  return {
    events,
    page: num(data.current_page) ?? 1,
    lastPage: num(data.last_page) ?? 1,
    total: num(data.total) ?? events.length,
  }
}

export function listCoolifyAudit(input: { page?: number; search?: string; source?: AuditSource } = {}) {
  const params = new URLSearchParams({ per_page: '50', page: String(Math.max(1, Math.trunc(input.page ?? 1))) })
  if (input.search) params.set('search', input.search.slice(0, 255))
  if (input.source && input.source !== 'all') params.set('source', input.source)
  return read(`/audit-events?${params.toString()}`, parseAuditPage)
}

/* ------------------------------------------------------------------ */
/* Déploiements en cours côté Coolify                                   */
/* ------------------------------------------------------------------ */

export interface CoolifyDeploymentView {
  id: string
  application: string
  server: string | null
  status: string
  commit: string | null
  origin: 'webhook' | 'api' | 'interface'
  createdAt: string
}

/** Sans journaux, configuration ni URL interne : seulement de quoi repérer un déploiement. */
export function parseDeployments(raw: unknown): CoolifyDeploymentView[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const data = obj(item)
      const id = str(data.deployment_uuid)
      if (!id) return null
      const commit = str(data.commit)
      return {
        id,
        application: str(data.application_name) ?? '—',
        server: str(data.server_name),
        status: str(data.status) ?? 'unknown',
        commit: commit && /^[0-9a-f]{7,40}$/i.test(commit) ? commit.slice(0, 7) : commit === 'HEAD' ? 'HEAD' : null,
        origin: bool(data.is_webhook) ? 'webhook' : bool(data.is_api) ? 'api' : 'interface',
        createdAt: str(data.created_at) ?? '',
      }
    })
    .filter((item): item is CoolifyDeploymentView => item !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const listCoolifyDeployments = () => read('/deployments', parseDeployments)

/* ------------------------------------------------------------------ */
/* Services (outils d'exploitation installés par E-FLEX)               */
/* ------------------------------------------------------------------ */

export interface CoolifyServiceView {
  id: string
  name: string
  status: string | null
}

export function parseServices(raw: unknown): CoolifyServiceView[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const data = obj(item)
      const id = str(data.uuid)
      if (!id) return null
      return { id, name: str(data.name) ?? id, status: str(data.status) }
    })
    .filter((item): item is CoolifyServiceView => item !== null)
}

export const listCoolifyServices = () => read('/services', parseServices)

/** Crée un service à partir d'un compose fourni et le démarre. */
export async function createComposeService(input: {
  name: string
  description: string
  compose: string
  serverUuid: string
  projectUuid: string
  environmentName: string
}): Promise<{ id: string } | { error: string }> {
  const res = await coolifyFetch<{ uuid?: unknown }>('/services', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      server_uuid: input.serverUuid,
      project_uuid: input.projectUuid,
      environment_name: input.environmentName,
      docker_compose_raw: Buffer.from(input.compose, 'utf8').toString('base64'),
      instant_deploy: true,
    }),
  })
  if (res.error) return { error: res.error }
  const id = str(res.data?.uuid)
  return id ? { id } : { error: "L'hébergement n'a pas renvoyé l'identifiant du service." }
}

/** Remplace le compose d'un service puis le redémarre (nouveau mot de passe, nouvelle version). */
export async function replaceServiceCompose(serviceUuid: string, compose: string) {
  const updated = await send(`/services/${enc(serviceUuid)}`, 'PATCH', {
    docker_compose_raw: Buffer.from(compose, 'utf8').toString('base64'),
  })
  if ('error' in updated) return updated
  return send(`/services/${enc(serviceUuid)}/restart`, 'POST')
}

/** Enregistre des variables d'un service (valeurs masquées dans Coolify) puis le redémarre. */
export async function setServiceVariables(serviceUuid: string, variables: Record<string, string>) {
  const data = Object.entries(variables).map(([key, value]) => ({ key, value, is_literal: true, is_shown_once: true }))
  const res = await coolifyFetch(`/services/${enc(serviceUuid)}/envs/bulk`, { method: 'PATCH', body: JSON.stringify({ data }) })
  if (res.error) return { error: res.error }
  return send(`/services/${enc(serviceUuid)}/restart`, 'POST')
}

/* ------------------------------------------------------------------ */
/* Notifications sortantes de Coolify (webhook vers E-FLEX)            */
/* ------------------------------------------------------------------ */

export interface CoolifyWebhookNotificationView {
  /** Coolify expose-t-il une configuration lisible (routes /notifications/webhook) ? */
  supported: boolean
  /** Canal webhook activé côté Coolify, si connu. */
  enabled: boolean | null
  /** URL de destination configurée côté Coolify, si connue (jamais de secret). */
  webhookUrl: string | null
  /** Champs sûrs détectés, pour diagnostic sans exposer de valeur sensible. */
  fields: string[]
}

const WEBHOOK_ENABLED_KEYS = ['webhook_enabled', 'is_webhook_enabled', 'enabled', 'webhook_notifications', 'is_enabled']
const WEBHOOK_URL_KEYS = ['webhook_url', 'url', 'endpoint', 'webhook_endpoint']

function pickBool(data: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'boolean') return value
    if (value === 1 || value === '1' || value === 'true') return true
    if (value === 0 || value === '0' || value === 'false') return false
  }
  return null
}

/**
 * Lit la configuration du canal de notification webhook de Coolify (best-effort, sans secrets).
 * Les routes `/notifications/webhook` ne sont pas garanties selon la version : en cas d'indisponibilité
 * ou d'erreur, on renvoie `supported: false` avec une liste de champs vide (jamais de message brut sensible).
 */
export function parseWebhookNotification(raw: unknown): CoolifyWebhookNotificationView {
  const data = obj(raw)
  const fields = Object.keys(data).filter((key) => /[a-z]/i.test(key))
  const webhookUrl = str(data[WEBHOOK_URL_KEYS.find((key) => typeof data[key] === 'string') ?? '']) ?? WEBHOOK_URL_KEYS.map((key) => str(data[key])).find((v): v is string => Boolean(v)) ?? null
  return {
    supported: fields.length > 0,
    enabled: pickBool(data, WEBHOOK_ENABLED_KEYS),
    webhookUrl,
    fields: fields.sort(),
  }
}

export async function getCoolifyWebhookNotification(): Promise<CoolifyWebhookNotificationView> {
  const res = await coolifyFetch<unknown>('/notifications/webhook', { signal: AbortSignal.timeout(8_000) })
  if (res.error) return { supported: false, enabled: null, webhookUrl: null, fields: [] }
  const parsed = parseWebhookNotification(res.data)
  // Un objet vide signifie que l'endpoint n'expose rien d'exploitable.
  return parsed.fields.length === 0 ? { supported: false, enabled: null, webhookUrl: null, fields: [] } : parsed
}
