/**
 * File de déploiement BullMQ sur Redis (issue 06).
 * `jobId = deploymentId` rend l'enfilement idempotent : un même déploiement
 * ne peut pas être traité deux fois en parallèle.
 */
import { Queue, type ConnectionOptions } from 'bullmq'
import IORedis, { type Redis } from 'ioredis'

export const DEPLOYMENT_QUEUE = 'eflex-deployments'

let queue: Queue | null = null
let redis: Redis | null = null

export type DeploymentJobQueueState =
  | 'waiting'
  | 'delayed'
  | 'prioritized'
  | 'active'
  | 'waiting-children'
  | 'completed'
  | 'failed'
  | 'missing'
  | 'unknown'

export interface DeploymentQueueDiagnostics {
  deploymentId: string
  state: DeploymentJobQueueState
  attemptsMade: number | null
  attemptsMax: number | null
  failedReason: string | null
  timestamp: string | null
  processedOn: string | null
  finishedOn: string | null
  delay: number | null
  stalled: boolean
}

export function redisConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL
  if (!raw) {
    throw new Error('REDIS_URL est absente : la file de déploiement ne peut pas démarrer.')
  }
  const url = new URL(raw)
  const db = url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : undefined
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isFinite(db) ? { db } : {}),
    // Obligatoire pour les Workers BullMQ (sinon ioredis rejette la commande).
    maxRetriesPerRequest: null,
  }
}

export function deploymentsQueue(): Queue {
  if (!queue) {
    queue = new Queue(DEPLOYMENT_QUEUE, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    })
  }
  return queue
}

function redisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
    })
    redis.on('error', () => {
      // Les lectures de diagnostic/verrou ne doivent jamais faire tomber le portail.
    })
  }
  return redis
}

function iso(ms: number | undefined): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export async function getDeploymentQueueDiagnostics(
  deploymentId: string,
): Promise<DeploymentQueueDiagnostics | null> {
  if (!process.env.REDIS_URL) return null
  try {
    const job = await deploymentsQueue().getJob(deploymentId)
    if (!job) {
      return {
        deploymentId,
        state: 'missing',
        attemptsMade: null,
        attemptsMax: null,
        failedReason: null,
        timestamp: null,
        processedOn: null,
        finishedOn: null,
        delay: null,
        stalled: false,
      }
    }
    const state = await job.getState().catch(() => 'unknown')
    const rawState = state as DeploymentJobQueueState
    const processedOnMs = typeof job.processedOn === 'number' ? job.processedOn : undefined
    return {
      deploymentId,
      state:
        rawState === 'waiting' ||
        rawState === 'delayed' ||
        rawState === 'prioritized' ||
        rawState === 'active' ||
        rawState === 'waiting-children' ||
        rawState === 'completed' ||
        rawState === 'failed'
          ? rawState
          : 'unknown',
      attemptsMade: typeof job.attemptsMade === 'number' ? job.attemptsMade : null,
      attemptsMax: typeof job.opts.attempts === 'number' ? job.opts.attempts : null,
      failedReason: typeof job.failedReason === 'string' && job.failedReason ? job.failedReason : null,
      timestamp: iso(job.timestamp),
      processedOn: iso(processedOnMs),
      finishedOn: iso(job.finishedOn ?? undefined),
      delay: typeof job.delay === 'number' ? job.delay : null,
      stalled:
        rawState === 'active' &&
        typeof processedOnMs === 'number' &&
        Date.now() - processedOnMs > 60_000,
    }
  } catch {
    return {
      deploymentId,
      state: 'unknown',
      attemptsMade: null,
      attemptsMax: null,
      failedReason: null,
      timestamp: null,
      processedOn: null,
      finishedOn: null,
      delay: null,
      stalled: false,
    }
  }
}

/**
 * Action admin sûre : relance le job BullMQ d'un déploiement non terminal.
 * - failed/completed (résiduel côté queue) : tentative de retry BullMQ quand possible, sinon ré-enfilement contrôlé.
 * - missing : ré-enfilement.
 * - waiting/delayed/prioritized/active/waiting-children : aucune action (déjà pris en charge).
 */
export async function recoverDeploymentQueueJob(
  deploymentId: string,
  options: { rollback?: boolean } = {},
): Promise<
  | { ok: true; action: 'retried' | 'reenqueued' | 'noop'; state: DeploymentJobQueueState }
  | { ok: false; error: string; state?: DeploymentJobQueueState }
> {
  if (!process.env.REDIS_URL) return { ok: false, error: 'Redis non configuré.' }
  try {
    const q = deploymentsQueue()
    const job = await q.getJob(deploymentId)
    if (!job) {
      await enqueueDeployment(deploymentId, options)
      return { ok: true, action: 'reenqueued', state: 'missing' }
    }
    const state = (await job.getState().catch(() => 'unknown')) as DeploymentJobQueueState
    if (
      state === 'waiting' ||
      state === 'delayed' ||
      state === 'prioritized' ||
      state === 'active' ||
      state === 'waiting-children'
    ) {
      return { ok: true, action: 'noop', state }
    }
    if (state === 'failed') {
      try {
        await job.retry('failed')
        return { ok: true, action: 'retried', state }
      } catch {
        await job.remove().catch(() => undefined)
        await enqueueDeployment(deploymentId, options)
        return { ok: true, action: 'reenqueued', state }
      }
    }
    // completed ou état résiduel : retrait puis ré-enfilement explicite (admin).
    await job.remove().catch(() => undefined)
    await enqueueDeployment(deploymentId, options)
    return { ok: true, action: 'reenqueued', state }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Impossible de relancer le job de déploiement.',
    }
  }
}

export async function getDeploymentQueueDiagnosticsBatch(
  deploymentIds: string[],
): Promise<Record<string, DeploymentQueueDiagnostics>> {
  const entries = await Promise.all(
    deploymentIds.map(async (id) => [id, await getDeploymentQueueDiagnostics(id)] as const),
  )
  const result: Record<string, DeploymentQueueDiagnostics> = {}
  for (const [id, diagnostics] of entries) {
    if (diagnostics) result[id] = diagnostics
  }
  return result
}

export async function acquireDeploymentLocks(
  keys: string[],
  ttlMs = 5 * 60_000,
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const client = redisClient()
  if (!client) return { acquired: true, release: async () => undefined }

  const unique = Array.from(new Set(keys)).sort()
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  const acquiredKeys: string[] = []

  const release = async () => {
    if (acquiredKeys.length === 0) return
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    await Promise.all(
      acquiredKeys.map((key) => client.eval(script, 1, key, token).catch(() => 0)),
    )
  }

  try {
    for (const key of unique) {
      const ok = await client.set(key, token, 'PX', ttlMs, 'NX')
      if (ok !== 'OK') {
        await release()
        return { acquired: false, release: async () => undefined }
      }
      acquiredKeys.push(key)
    }
    return { acquired: true, release }
  } catch {
    await release()
    // Redis indisponible : ne pas bloquer si on ne peut pas verrouiller, le garde-fou DB reste actif.
    return { acquired: true, release: async () => undefined }
  }
}

export async function enqueueDeployment(
  deploymentId: string,
  options: { rollback?: boolean } = {},
): Promise<void> {
  const q = deploymentsQueue()
  const existing = await q.getJob(deploymentId)
  if (existing) {
    const state = await existing.getState()
    // Idempotence : un job déjà présent (en attente, actif, retardé, terminé ou
    // en échec côté BullMQ) ne doit pas provoquer un double traitement ni faire
    // échouer l'enfilement. L'état métier reste la source de vérité.
    if (
      state === 'waiting' ||
      state === 'delayed' ||
      state === 'prioritized' ||
      state === 'active' ||
      state === 'waiting-children' ||
      state === 'completed' ||
      state === 'failed'
    ) {
      return
    }
    // Job dans un état résiduel : on le retire avant de ré-enfiler proprement.
  await existing.remove().catch(() => undefined)
  }
  // L'intention « retour arrière » voyage avec le job : BullMQ conserve les
  // données du job à travers les reprises, et le worker choisit l'endpoint
  // Coolify en conséquence (voir `worker.ts` et `lib/deployment-rollback.ts`).
  try {
    await q.add(
      'deploy',
      { deploymentId, ...(options.rollback ? { rollback: true } : {}) },
      { jobId: deploymentId },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Course entre deux enfilements simultanés : le job existe déjà, ce qui est
    // exactement l'idempotence recherchée.
    if (/already exists|Job .* exists/i.test(message)) return
    throw error
  }
}

/**
 * Retire un job encore en attente (annulation d'un déploiement `queued`).
 * Un job déjà pris par le worker ne peut pas être supprimé : `active` est
 * renvoyé pour que l'appelant tente l'annulation côté Coolify.
 */
export async function removeQueuedDeployment(
  deploymentId: string,
): Promise<'removed' | 'active' | 'missing' | 'error'> {
  try {
    const job = await deploymentsQueue().getJob(deploymentId)
    if (!job) return 'missing'
    const state = await job.getState()
    if (state !== 'waiting' && state !== 'delayed' && state !== 'prioritized') return 'active'
    await job.remove()
    return 'removed'
  } catch {
    return 'error'
  }
}
