import { coolifyFetch } from '@/lib/coolify'

/**
 * Capacités détectées de l'instance Coolify (version + sondages légers, non destructifs).
 *
 * Objectif : piloter ce qu'EFLEX expose/exécute selon ce que l'instance supporte
 * réellement, sans dépendre uniquement d'un numéro de version.
 */

export interface CoolifyRuntimeCapabilities {
  /** Chaîne de version brute renvoyée par Coolify, ou null si inconnue. */
  version: string | null
  /** Détection effectuée avec succès (au moins `/version` ou l'instance répond). */
  reachable: boolean
  /** API bases managées joignable (`GET /databases`) : true/false sondé, null inconnu. */
  databaseApiAvailable: boolean | null
  checkedAt: number
}

const CACHE_TTL_MS = 5 * 60_000
let cached: Promise<CoolifyRuntimeCapabilities> | null = null
let cachedAt = 0

function parseVersion(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    return trimmed || null
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['version', 'coolify', 'coolify_version']) {
      const value = obj[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

/** Lit la version Coolify (`GET /version`). Ne lève pas d'erreur fatale. */
export async function fetchCoolifyVersion(): Promise<{ version: string | null } | { error: string }> {
  const res = await coolifyFetch<unknown>('/version', { signal: AbortSignal.timeout(8_000) })
  if (res.error) return { error: res.error }
  return { version: parseVersion(res.data) }
}

async function probeDatabaseApi(): Promise<boolean | null> {
  const res = await coolifyFetch<unknown>('/databases', { signal: AbortSignal.timeout(8_000) })
  if (res.error) {
    if (res.error.includes('API 404')) return false
    return null
  }
  return true
}

/**
 * Capacités runtime Coolify, mises en cache (TTL court) pour éviter de sonder à chaque requête.
 * En cas d'erreur réseau/API, renvoie un état non joignable non mis en cache durablement.
 */
export async function getCoolifyRuntimeCapabilities(options?: {
  force?: boolean
}): Promise<CoolifyRuntimeCapabilities> {
  const now = Date.now()
  if (!options?.force && cached && now - cachedAt < CACHE_TTL_MS) return cached

  const load = (async (): Promise<CoolifyRuntimeCapabilities> => {
    const [versionResult, databaseApiAvailable] = await Promise.all([
      fetchCoolifyVersion(),
      probeDatabaseApi(),
    ])
    if ('error' in versionResult) {
      return { version: null, reachable: false, databaseApiAvailable, checkedAt: Date.now() }
    }
    return { version: versionResult.version, reachable: true, databaseApiAvailable, checkedAt: Date.now() }
  })()

  if (!options?.force) {
    cached = load
    cachedAt = now
  }
  const resolved = await load
  // Ne pas garder en cache un état d'échec prolongé : permet de se rétablir vite.
  if (!resolved.reachable && !resolved.databaseApiAvailable && cached) {
    cached = null
  }
  return resolved
}

/** Réinitialise le cache (tests / changement de configuration). */
export function resetCoolifyCapabilitiesCache(): void {
  cached = null
  cachedAt = 0
}
