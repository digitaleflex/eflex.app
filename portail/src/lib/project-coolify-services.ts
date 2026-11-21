import { z } from 'zod'
import {
  coolifyFetch,
  createOneClickService,
  deleteServiceInstance,
  getServiceInstance,
  listTargetServices,
  restartService,
  startService,
  stopService,
  type CoolifyServiceInstance,
} from '@/lib/coolify'
import { MANAGED_SERVICES_CATALOG } from '@/lib/managed-services-catalog'

export type ProjectServiceView = {
  id: string
  name: string
  status: string | null
  catalogId: string
  label: string
}

const SUPPORTED = new Map(
  MANAGED_SERVICES_CATALOG.filter((e) => e.coolifyServiceType).map((e) => [e.id, { type: e.coolifyServiceType as string, label: e.label }]),
)

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'app'
}

export function projectServicePrefix(projectSlug: string): string {
  return `eflex-${sanitizeToken(projectSlug)}-svc-`
}

export function projectServiceName(projectSlug: string, catalogId: string): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${projectServicePrefix(projectSlug)}${sanitizeToken(catalogId)}-${suffix}`.slice(0, 60)
}

function detectCatalogId(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null
  const rest = name.slice(prefix.length)
  // rest is "<catalogId>-<rand>" or "<catalogId>"
  for (const catalogId of SUPPORTED.keys()) {
    if (rest === catalogId || rest.startsWith(`${catalogId}-`)) return catalogId
  }
  // fallback: strip trailing -xxxx
  return rest.replace(/-[a-z0-9]{4}$/, '') || null
}

export function isSupportedCatalogService(catalogId: string): boolean {
  return SUPPORTED.has(catalogId)
}

export function supportedServiceEntries() {
  return MANAGED_SERVICES_CATALOG.filter((e) => e.coolifyServiceType)
}

export async function listProjectCoolifyServices(projectSlug: string): Promise<{ services: ProjectServiceView[] } | { error: string }> {
  const listed = await listTargetServices()
  if ('error' in listed) return listed
  const prefix = projectServicePrefix(projectSlug)
  const services: ProjectServiceView[] = []
  for (const service of listed.services) {
    const catalogId = detectCatalogId(service.name, prefix)
    if (!catalogId) continue
    const supported = SUPPORTED.get(catalogId)
    services.push({
      id: service.id,
      name: service.name,
      status: service.status,
      catalogId,
      label: supported?.label ?? catalogId,
    })
  }
  return { services }
}

export async function createProjectCoolifyService(
  projectSlug: string,
  catalogId: string,
): Promise<{ service: { id: string; catalogId: string } } | { error: string; status?: number }> {
  const entry = SUPPORTED.get(catalogId)
  if (!entry) return { error: 'Ce service n’est pas disponible au provisionnement automatique pour le moment.', status: 400 }
  const existing = await listProjectCoolifyServices(projectSlug)
  if (!('error' in existing) && existing.services.some((s) => s.catalogId === catalogId)) {
    return { error: 'Ce service est déjà provisionné pour ce projet.', status: 409 }
  }
  const created = await createOneClickService(entry.type, projectServiceName(projectSlug, catalogId))
  if ('error' in created) return { error: created.error, status: 502 }
  return { service: { id: created.id, catalogId } }
}

export async function serviceAction(serviceId: string, action: 'start' | 'stop' | 'restart'): Promise<{ ok: true } | { error: string }> {
  if (action === 'start') return startService(serviceId)
  if (action === 'stop') return stopService(serviceId)
  return restartService(serviceId)
}

export type ServiceEnvKeyView = {
  key: string
  isBuildTime: boolean
  isPreview: boolean
}

function parseEnvKeys(raw: unknown): ServiceEnvKeyView[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const key = typeof row.key === 'string' ? row.key : null
      if (!key) return null
      return {
        key,
        isBuildTime: row.is_build_time === true || row.isBuildTime === true,
        isPreview: row.is_preview === true || row.isPreview === true,
      }
    })
    .filter((item): item is ServiceEnvKeyView => item !== null)
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** Liste les clés de variables d’un service (sans valeurs sensibles). */
export async function listServiceEnvKeys(serviceId: string): Promise<{ keys: ServiceEnvKeyView[] } | { error: string }> {
  const res = await coolifyFetch<unknown>(`/services/${encodeURIComponent(serviceId)}/envs`)
  if (res.error) return { error: res.error }
  return { keys: parseEnvKeys(res.data) }
}

/* ------------------------------------------------------------------ */
/* Capacités / découverte des types one-click (instance)               */
/* ------------------------------------------------------------------ */

export type ServiceTypeCapabilities = {
  /** Types réellement annoncés par l’instance (si découverts). */
  instanceTypes: string[] | null
  /** Source de la découverte. */
  source: 'instance' | 'catalog'
  /** Message explicite si la découverte est partielle/indisponible. */
  message: string | null
  /** Entrées du catalogue considérées comme provisionnables sur cette instance. */
  provisionableCatalogIds: string[]
  /** Par entrée catalogue : provisionnable sur cette instance ? */
  byCatalogId: Record<string, { provisionable: boolean; reason: string | null }>
}

function collectTypeStrings(raw: unknown, depth = 0): string[] {
  if (depth > 4 || raw == null) return []
  if (typeof raw === 'string') return [raw.trim()].filter(Boolean)
  if (Array.isArray(raw)) return raw.flatMap((item) => collectTypeStrings(item, depth + 1))
  if (typeof raw === 'object') {
    const row = raw as Record<string, unknown>
    const out: string[] = []
    for (const key of ['type', 'slug', 'name', 'id', 'service_type', 'one_click_service']) {
      const v = row[key]
      if (typeof v === 'string' && v.trim()) out.push(v.trim())
    }
    // certains formats imbriquent des listes
    for (const key of ['types', 'services', 'data', 'templates', 'one_click_services']) {
      if (row[key] !== undefined) out.push(...collectTypeStrings(row[key], depth + 1))
    }
    // si l'objet est un mapping type->meta
    if (out.length === 0) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'object' && v !== null) out.push(k)
      }
    }
    return out
  }
  return []
}

/** Découvre les types/templates one-click supportés par l’instance Coolify. */
export async function discoverServiceTypeCapabilities(): Promise<ServiceTypeCapabilities> {
  const catalogEntries = supportedServiceEntries()
  const catalogTypes = catalogEntries
    .map((e) => e.coolifyServiceType)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)

  const res = await coolifyFetch<unknown>('/services/types', { signal: AbortSignal.timeout(10_000) })
  if (!res.error && res.data != null) {
    const discovered = Array.from(new Set(collectTypeStrings(res.data).map((t) => t.toLowerCase())))
    if (discovered.length > 0) {
      const supportedSet = new Set(discovered)
      const byCatalogId: ServiceTypeCapabilities['byCatalogId'] = {}
      const provisionableCatalogIds: string[] = []
      for (const entry of catalogEntries) {
        const type = (entry.coolifyServiceType ?? '').toLowerCase()
        const ok = type.length > 0 && supportedSet.has(type)
        byCatalogId[entry.id] = ok
          ? { provisionable: true, reason: null }
          : { provisionable: false, reason: 'Type non annoncé par cette instance Coolify.' }
        if (ok) provisionableCatalogIds.push(entry.id)
      }
      return {
        instanceTypes: discovered,
        source: 'instance',
        message: null,
        provisionableCatalogIds,
        byCatalogId,
      }
    }
  }

  // Fallback : catalogue local (on ne peut pas confirmer le support réel)
  const unavailable = res.error
    ? `Découverte des types indisponible (${res.error.includes('404') || res.error.includes('405') ? 'endpoint /services/types non exposé' : 'instance injoignable ou erreur'}). Affichage basé sur le catalogue EFLEX.`
    : 'La découverte des types n’a pas renvoyé de liste exploitable. Affichage basé sur le catalogue EFLEX.'
  const byCatalogId: ServiceTypeCapabilities['byCatalogId'] = {}
  const provisionableCatalogIds: string[] = []
  for (const entry of catalogEntries) {
    byCatalogId[entry.id] = { provisionable: true, reason: 'Support non confirmé : basé sur le catalogue EFLEX.' }
    provisionableCatalogIds.push(entry.id)
  }
  return {
    instanceTypes: null,
    source: 'catalog',
    message: unavailable,
    provisionableCatalogIds,
    byCatalogId,
  }
}

/* ------------------------------------------------------------------ */
/* Variables d’environnement (service)                                 */
/* ------------------------------------------------------------------ */

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
export const SERVICE_ENV_MAX = 100
export const SERVICE_ENV_VALUE_MAX = 32768

export const serviceEnvSetSchema = z.object({
  variables: z
    .array(
      z.object({
        key: z.string().min(1).max(128).regex(ENV_KEY_RE, 'Nom de variable invalide (lettres, chiffres, _, sans commencer par un chiffre).'),
        value: z.string().max(SERVICE_ENV_VALUE_MAX),
        isBuildTime: z.boolean().optional(),
        isPreview: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(SERVICE_ENV_MAX),
})

/** Définir/modifier des variables d’un service (valeurs fournies, jamais renvoyées). */
export async function setServiceEnvVars(
  serviceId: string,
  variables: Array<{ key: string; value: string; isBuildTime?: boolean; isPreview?: boolean }>,
): Promise<{ ok: true; restarted: boolean; message: string | null } | { error: string }> {
  if (variables.length === 0) return { error: 'Aucune variable à enregistrer.' }
  // Déduplication par clé (la dernière valeur gagne)
  const byKey = new Map<string, (typeof variables)[number]>()
  for (const v of variables) byKey.set(v.key, v)
  const data = Array.from(byKey.values()).map((v) => ({
    key: v.key,
    value: v.value,
    is_literal: true,
    is_shown_once: true,
    is_build_time: v.isBuildTime === true,
    is_preview: v.isPreview === true,
  }))

  const bulk = await coolifyFetch<unknown>(`/services/${encodeURIComponent(serviceId)}/envs/bulk`, {
    method: 'PATCH',
    body: JSON.stringify({ data }),
  })
  if (bulk.error) {
    // Certains environnements peuvent ne pas exposer le bulk : signaler clairement.
    if (bulk.error.includes('404') || bulk.error.includes('405')) {
      return { error: "L’API Coolify de cette instance ne permet pas la modification en lot des variables de ce service." }
    }
    return { error: bulk.error }
  }

  const restartedRes = await restartService(serviceId)
  if ('error' in restartedRes) {
    return { ok: true, restarted: false, message: `Variables enregistrées, mais le redémarrage automatique a échoué : ${restartedRes.error}` }
  }
  return { ok: true, restarted: true, message: null }
}

/* ------------------------------------------------------------------ */
/* Détail riche, domaines/FQDN, configuration/volumes (sans secrets)   */
/* ------------------------------------------------------------------ */

export type ServiceDomainTarget = {
  /** UUID du composant applicatif (service application) portant le domaine. */
  uuid: string
  name: string
  fqdn: string | null
  /** Domaines normalisés (liste) si disponibles. */
  domains: string[]
  kind: 'application' | 'database' | 'service'
}

export type ServiceVolumeView = {
  name: string | null
  mountPath: string | null
  hostPath: string | null
  source: string
}

export type ServiceConfigView = {
  id: string
  name: string
  status: string | null
  type: string | null
  description: string | null
  envKeys: ServiceEnvKeyView[]
  domainTargets: ServiceDomainTarget[]
  volumes: ServiceVolumeView[]
  /** Capacités effectivement observées sur ce service. */
  capabilities: {
    envRead: boolean
    envWrite: boolean | null
    domainsRead: boolean
    domainsWrite: boolean | null
    volumesRead: boolean
  }
  /** Notes de dégradation (API partielle / champs non exposés). */
  notes: string[]
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return null
}

function splitDomains(value: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,\s]+/)
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
}

function parseDomainTargets(raw: Record<string, unknown>, serviceId: string, serviceName: string): ServiceDomainTarget[] {
  const targets: ServiceDomainTarget[] = []
  const serviceFqdn = pickString(raw, ['fqdn', 'domains'])
  if (serviceFqdn) {
    targets.push({
      uuid: serviceId,
      name: serviceName,
      fqdn: serviceFqdn,
      domains: splitDomains(serviceFqdn),
      kind: 'service',
    })
  }
  for (const item of asArray(raw.applications)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const uuid = pickString(row, ['uuid', 'id'])
    if (!uuid) continue
    const name = pickString(row, ['name', 'human_name', 'service_name']) ?? uuid
    const fqdn = pickString(row, ['fqdn', 'domains'])
    targets.push({ uuid, name, fqdn, domains: splitDomains(fqdn), kind: 'application' })
  }
  for (const item of asArray(raw.databases)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const uuid = pickString(row, ['uuid', 'id'])
    if (!uuid) continue
    const fqdn = pickString(row, ['fqdn', 'domains', 'public_url'])
    if (!fqdn) continue
    const name = pickString(row, ['name', 'human_name']) ?? uuid
    targets.push({ uuid, name, fqdn, domains: splitDomains(fqdn), kind: 'database' })
  }
  return targets
}

function parseVolumesFromStorages(raw: unknown, source: string): ServiceVolumeView[] {
  if (!Array.isArray(raw)) return []
  const out: ServiceVolumeView[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const mountPath = pickString(row, ['mount_path', 'mountPath', 'destination'])
    const hostPath = pickString(row, ['host_path', 'hostPath', 'source_path'])
    const name = pickString(row, ['name', 'volume_name', 'id', 'uuid'])
    if (!mountPath && !hostPath && !name) continue
    out.push({ name, mountPath, hostPath, source })
  }
  return out
}

function parseVolumesFromRaw(raw: Record<string, unknown>): ServiceVolumeView[] {
  const volumes: ServiceVolumeView[] = []
  volumes.push(...parseVolumesFromStorages(raw.persistent_storages, 'service'))
  volumes.push(...parseVolumesFromStorages(raw.storages, 'service'))
  volumes.push(...parseVolumesFromStorages(raw.volumes, 'service'))
  for (const bucket of ['applications', 'databases'] as const) {
    for (const item of asArray(raw[bucket])) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const compName = pickString(row, ['name', 'human_name']) ?? bucket
      volumes.push(...parseVolumesFromStorages(row.persistent_storages, compName))
      volumes.push(...parseVolumesFromStorages(row.storages, compName))
      volumes.push(...parseVolumesFromStorages(row.volumes, compName))
    }
  }
  // dédup simple
  const seen = new Set<string>()
  return volumes.filter((v) => {
    const key = `${v.source}|${v.name ?? ''}|${v.mountPath ?? ''}|${v.hostPath ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Récupère le détail brut d’un service (sans exposition directe à l’UI). */
export async function getServiceRaw(serviceId: string): Promise<{ raw: Record<string, unknown> } | { error: string }> {
  const res = await coolifyFetch<unknown>(`/services/${encodeURIComponent(serviceId)}`)
  if (res.error) return { error: res.error }
  if (!res.data || typeof res.data !== 'object') return { error: 'Réponse invalide du service.' }
  return { raw: res.data as Record<string, unknown> }
}

/** Construit une vue de configuration sans secrets pour l’UI. */
export async function getProjectServiceConfig(serviceId: string): Promise<ServiceConfigView | { error: string }> {
  const [rawRes, envsRes] = await Promise.all([getServiceRaw(serviceId), listServiceEnvKeys(serviceId)])
  if ('error' in rawRes) return { error: rawRes.error }

  const raw = rawRes.raw
  const id = pickString(raw, ['uuid', 'id']) ?? serviceId
  const name = pickString(raw, ['name']) ?? serviceId
  const status = pickString(raw, ['status'])
  const type = pickString(raw, ['service_type', 'type', 'one_click_service'])
  const description = pickString(raw, ['description'])

  const envKeys = 'error' in envsRes ? [] : envsRes.keys
  const domainTargets = parseDomainTargets(raw, id, name)
  const volumes = parseVolumesFromRaw(raw)
  const notes: string[] = []

  if ('error' in envsRes) {
    notes.push(`Variables d’environnement non lisibles : ${envsRes.error}`)
  }
  // La possibilité d’écriture réelle dépend de l’instance ; on l’indique comme « à confirmer ».
  notes.push('La modification des variables nécessite le support de l’API Coolify et redémarre le service.')
  const hasDomainComponents = domainTargets.length > 0 || asArray(raw.applications).length > 0
  if (!hasDomainComponents) {
    notes.push('Aucun composant configurable en domaine/FQDN n’est exposé par l’API pour ce service.')
  }
  if (volumes.length === 0) {
    notes.push('Aucune information de volume exposée par l’API pour ce service.')
  }

  return {
    id,
    name,
    status,
    type,
    description,
    envKeys,
    domainTargets,
    volumes,
    capabilities: {
      envRead: !('error' in envsRes),
      envWrite: null, // confirmé à l’usage
      domainsRead: hasDomainComponents,
      domainsWrite: hasDomainComponents ? null : false,
      volumesRead: volumes.length > 0,
    },
    notes,
  }
}

export const serviceDomainsSchema = z.object({
  targetUuid: z.string().min(1).max(128),
  /** Domaines/FQDN complets, séparés par virgule ou nouvelle ligne. Vide pour retirer. */
  domains: z.string().max(2000),
})

/**
 * Met à jour les domaines/FQDN d’un composant de service.
 * Tente plusieurs stratégies d’API (les services one-click exposent les domaines selon la version).
 */
export async function updateServiceComponentDomains(
  serviceId: string,
  targetUuid: string,
  fqdnValue: string,
): Promise<{ ok: true; message: string | null } | { error: string }> {
  const rawRes = await getServiceRaw(serviceId)
  if ('error' in rawRes) return { error: rawRes.error }
  const raw = rawRes.raw
  const serviceUuid = pickString(raw, ['uuid', 'id']) ?? serviceId

  // Déterminer si la cible est une application du service (mise à jour via /applications/{uuid}).
  const appUuids = new Set(
    asArray(raw.applications)
      .map((item) => (item && typeof item === 'object' ? pickString(item as Record<string, unknown>, ['uuid', 'id']) : null))
      .filter((v): v is string => Boolean(v)),
  )

  const attempts: Array<() => Promise<{ ok: true } | { error: string } | null>> = []

  if (appUuids.has(targetUuid) || targetUuid !== serviceUuid) {
    // Composant applicatif : l’API applications accepte généralement `domains`/`fqdn`.
    attempts.push(async () => {
      const res = await coolifyFetch(`/applications/${encodeURIComponent(targetUuid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ domains: fqdnValue, fqdn: fqdnValue }),
      })
      if (!res.error) return { ok: true }
      if (res.error.includes('404') || res.error.includes('405')) return null
      return { error: res.error }
    })
  }

  // Cible = service lui-même
  if (targetUuid === serviceUuid) {
    attempts.push(async () => {
      const res = await coolifyFetch(`/services/${encodeURIComponent(serviceUuid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ fqdn: fqdnValue, domains: fqdnValue }),
      })
      if (!res.error) return { ok: true }
      if (res.error.includes('404') || res.error.includes('405')) return null
      return { error: res.error }
    })
  }

  let lastUnsupported = false
  for (const attempt of attempts) {
    const result = await attempt()
    if (result === null) {
      lastUnsupported = true
      continue
    }
    if ('error' in result) return { error: result.error }
    return { ok: true, message: 'Domaines mis à jour. Un redéploiement/redémarrage du service peut être nécessaire pour appliquer le routage.' }
  }

  if (lastUnsupported || attempts.length === 0) {
    return { error: "La configuration des domaines/FQDN n’est pas supportée par l’API Coolify pour ce composant." }
  }
  return { error: 'Impossible de mettre à jour les domaines de ce service.' }
}

export { deleteServiceInstance, getServiceInstance }
export type { CoolifyServiceInstance }
