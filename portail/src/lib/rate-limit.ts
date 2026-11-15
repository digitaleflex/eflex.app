import Redis from 'ioredis'

/**
 * Limiteur de débit partagé (Redis) avec repli mémoire si Redis est indisponible.
 *
 * Stratégie (fenêtre fixe) : `INCR` + `PEXPIRE` sur une clé préfixée.
 * - Redis disponible : limite distribuée entre instances (recommandé en prod).
 * - Redis absent ou en erreur : repli mémoire **par processus** pour ne pas casser
 *   les flux légitimes. Ce repli n'est pas partagé entre instances et se réinitialise
 *   au redémarrage ; il sert de filet de sécurité, pas de protection distribuée.
 *
 * Quand `REDIS_URL` est configuré mais que Redis échoue, on marque le client en
 * dégradation pendant une courte période pour éviter des tentatives de connexion à
 * chaque requête (latence/erreurs), puis on réessaie.
 */
const PREFIX = 'eflex:rl:'
const REDIS_RETRY_AFTER_MS = 15_000
const hits = new Map<string, number[]>()

let client: Redis | null | undefined
let redisDegradedUntil = 0
let redisDegradedLogged = false

function redis(): Redis | null {
  if (client !== undefined) return client
  if (!process.env.REDIS_URL) {
    client = null
    return client
  }
  client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
  })
  client.on('error', () => {
    // Les échecs sont gérés à l'appel : on évite de polluer les logs.
  })
  return client
}

function markRedisHealthy(): void {
  redisDegradedUntil = 0
  redisDegradedLogged = false
}

function markRedisDegraded(now = Date.now()): void {
  redisDegradedUntil = now + REDIS_RETRY_AFTER_MS
  if (!redisDegradedLogged) {
    redisDegradedLogged = true
    console.warn(
      '[rate-limit] Redis indisponible : repli sur un limiteur mémoire local (non partagé entre instances).',
    )
  }
}

export function allowMemory(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)

  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  return true
}

/** État du stockage distribué : utile pour le diagnostic, pas pour la décision métier. */
export function getRateLimitMode(): 'redis' | 'memory' | 'redis-degraded' {
  if (!process.env.REDIS_URL) return 'memory'
  if (redisDegradedUntil > Date.now()) return 'redis-degraded'
  return 'redis'
}

/** Réinitialise l'état mémoire et la dégradation (tests uniquement). */
export function __resetRateLimitStateForTests(): void {
  hits.clear()
  redisDegradedUntil = 0
  redisDegradedLogged = false
  client = undefined
}

/** Retourne true si l'appel est autorisé, et le comptabilise. */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const store = redis()
  if (store) {
    if (redisDegradedUntil <= Date.now()) {
      try {
        if (store.status === 'wait' || store.status === 'end' || store.status === 'close') await store.connect()
        const redisKey = `${PREFIX}${key}`
        const count = await store.incr(redisKey)
        if (count === 1) await store.pexpire(redisKey, windowMs)
        markRedisHealthy()
        return count <= limit
      } catch {
        markRedisDegraded()
      }
    }
  }
  return allowMemory(key, limit, windowMs)
}

/**
 * Limite par organisation (clé `org:<organizationId>:<action>`), en plus des
 * limites par utilisateur. Permet de contenir un usage abusif réparti entre
 * plusieurs comptes d'une même organisation.
 */
export async function allowOrg(
  organizationId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return allow(`org:${organizationId}:${action}`, limit, windowMs)
}


/** Extrait la meilleure IP cliente disponible (proxy de confiance en tête). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const cf = request.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  return 'unknown'
}

/** Limite par adresse IP (utile pour les points d'entrée non authentifiés). */
export async function allowIp(request: Request, action: string, limit: number, windowMs: number): Promise<boolean> {
  return allow(`ip:${getClientIp(request)}:${action}`, limit, windowMs)
}
