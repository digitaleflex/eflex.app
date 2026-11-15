/**
 * File de déploiement BullMQ sur Redis (issue 06).
 * `jobId = deploymentId` rend l'enfilement idempotent : un même déploiement
 * ne peut pas être traité deux fois en parallèle.
 */
import { Queue, type ConnectionOptions } from 'bullmq'

export const DEPLOYMENT_QUEUE = 'eflex-deployments'

let queue: Queue | null = null

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
