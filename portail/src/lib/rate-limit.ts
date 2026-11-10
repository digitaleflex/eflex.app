import Redis from 'ioredis'

/**
 * Limiteur de débit partagé (Redis) avec repli mémoire si Redis est indisponible.
 * Fenêtre fixe : `INCR` + `PEXPIRE` sur une clé préfixée.
 */
const PREFIX = 'eflex:rl:'
const hits = new Map<string, number[]>()

let client: Redis | null | undefined

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
    // Le repli mémoire prend le relais ; on évite de polluer les logs à chaque requête.
  })
  return client
}

function allowMemory(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
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

/** Retourne true si l'appel est autorisé, et le comptabilise. */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const store = redis()
  if (store) {
    try {
      if (store.status === 'wait') await store.connect()
      const redisKey = `${PREFIX}${key}`
      const count = await store.incr(redisKey)
      if (count === 1) await store.pexpire(redisKey, windowMs)
      return count <= limit
    } catch {
      // Redis indisponible : on continue avec le compteur local.
    }
  }
  return allowMemory(key, limit, windowMs)
}
