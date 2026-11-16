import Redis from 'ioredis'
import { NextResponse } from 'next/server'

/**
 * Limiteur de débit partagé (Redis) avec repli mémoire si Redis est indisponible.
 *
 * Stratégie (fenêtre fixe côté Redis, fenêtre glissante en mémoire) :
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

export type RateLimitScope = 'user' | 'org' | 'ip' | 'key'

export interface RateLimitMeta {
  /** Action logique (jamais d'identifiant/secret). */
  action?: string
  scope?: RateLimitScope
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Secondes entières avant nouvelle tentative (>= 1 quand refusé). */
  retryAfterSec: number
  /** Horodatage (ms) de fin de fenêtre estimée. */
  resetAt: number
  mode: 'redis' | 'memory' | 'redis-degraded'
}

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

function memoryResult(allowed: boolean, limit: number, recentCount: number, retryAfterSec: number, resetAt: number): RateLimitResult {
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - recentCount),
    retryAfterSec: allowed ? 0 : Math.max(1, retryAfterSec),
    resetAt,
    mode: 'memory',
  }
}

export function checkMemory(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    const oldest = recent[0] ?? now
    const resetAt = oldest + windowMs
    return memoryResult(false, limit, recent.length, Math.ceil((resetAt - now) / 1000), resetAt)
  }
  recent.push(now)
  hits.set(key, recent)

  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  const oldest = recent[0] ?? now
  return memoryResult(true, limit, recent.length, 0, oldest + windowMs)
}

export function allowMemory(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  return checkMemory(key, limit, windowMs, now).allowed
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

function logRateLimitRefused(result: RateLimitResult, meta?: RateLimitMeta): void {
  try {
    console.warn(
      JSON.stringify({
        event: 'rate_limit.refused',
        action: meta?.action ?? 'unknown',
        scope: meta?.scope ?? 'key',
        mode: result.mode,
        limit: result.limit,
        retryAfterSec: result.retryAfterSec,
      }),
    )
  } catch {
    // La journalisation ne doit jamais casser la réponse.
  }
}

/** Vérifie et comptabilise un appel. Journalise les refus de façon structurée (sans PII). */
export async function check(
  key: string,
  limit: number,
  windowMs: number,
  meta?: RateLimitMeta,
): Promise<RateLimitResult> {
  const now = Date.now()
  const store = redis()
  if (store) {
    if (redisDegradedUntil <= now) {
      try {
        if (store.status === 'wait' || store.status === 'end' || store.status === 'close') await store.connect()
        const redisKey = `${PREFIX}${key}`
        const count = await store.incr(redisKey)
        if (count === 1) await store.pexpire(redisKey, windowMs)
        markRedisHealthy()
        const ttl = await store.pttl(redisKey)
        const resetAt = ttl > 0 ? now + ttl : now + windowMs
        const allowed = count <= limit
        const result: RateLimitResult = {
          allowed,
          limit,
          remaining: Math.max(0, limit - count),
          retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
          resetAt,
          mode: 'redis',
        }
        if (!allowed) logRateLimitRefused(result, meta)
        return result
      } catch {
        markRedisDegraded(now)
      }
    }
  }
  const result = checkMemory(key, limit, windowMs, now)
  if (redisDegradedUntil > now) result.mode = 'redis-degraded'
  if (!result.allowed) logRateLimitRefused(result, meta)
  return result
}

/** Retourne true si l'appel est autorisé, et le comptabilise. */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await check(key, limit, windowMs)).allowed
}

/**
 * Limite par organisation (clé `org:<organizationId>:<action>`), en plus des
 * limites par utilisateur. Permet de contenir un usage abusif réparti entre
 * plusieurs comptes d'une même organisation.
 */
export async function checkOrg(
  organizationId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return check(`org:${organizationId}:${action}`, limit, windowMs, { action, scope: 'org' })
}

export async function allowOrg(
  organizationId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return (await checkOrg(organizationId, action, limit, windowMs)).allowed
}

/**
 * Adresse du client telle que vue par le proxy de confiance (Traefik, un seul saut).
 *
 * `X-Forwarded-For` est envoyé par le client : la première entrée est donc falsifiable et permettait de
 * contourner les limites par IP en changeant d'adresse à chaque requête. Le proxy ajoute l'adresse
 * réelle **à la fin** : c'est celle-ci qui est retenue (audit de sécurité 2026-11). Avec plusieurs
 * proxys de confiance, régler `TRUSTED_PROXY_HOPS`.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const entries = forwarded.split(',').map((entry) => entry.trim()).filter(Boolean)
    const hops = Math.min(10, Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1))
    const chosen = entries[Math.max(0, entries.length - hops)]
    if (chosen) return chosen
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const cf = request.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  return 'unknown'
}

/** Limite par adresse IP (utile pour les points d'entrée non authentifiés). */
export async function checkIp(
  request: Request,
  action: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return check(`ip:${getClientIp(request)}:${action}`, limit, windowMs, { action, scope: 'ip' })
}

export async function allowIp(request: Request, action: string, limit: number, windowMs: number): Promise<boolean> {
  return (await checkIp(request, action, limit, windowMs)).allowed
}

/** En-têtes standard de limitation (Retry-After seulement si refusé). */
export function rateLimitHeaders(result: Pick<RateLimitResult, 'allowed' | 'limit' | 'remaining' | 'retryAfterSec' | 'resetAt'>): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
  if (!result.allowed) headers['Retry-After'] = String(Math.max(1, result.retryAfterSec))
  return headers
}

/** Réponse JSON 429 standard avec en-têtes de limitation. */
export function rateLimitedResponse(
  result: RateLimitResult,
  error = 'Trop de requêtes. Patientez un instant.',
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error },
    { status: 429, headers: { ...rateLimitHeaders(result), ...extraHeaders } },
  )
}
