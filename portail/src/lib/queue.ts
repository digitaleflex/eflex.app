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

export async function enqueueDeployment(deploymentId: string): Promise<void> {
  await deploymentsQueue().add('deploy', { deploymentId }, { jobId: deploymentId })
}
