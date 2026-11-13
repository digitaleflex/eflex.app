import { assertCryptoConfig } from './lib/crypto'

/**
 * Démarrage côté serveur Node (appelé par `instrumentation.ts`, jamais importé pour edge).
 *
 * - Validation au démarrage (issue 04) : en production, le portail refuse de démarrer si la clé
 *   de chiffrement des variables est absente. Ignorée pendant `next build`.
 * - Worker de déploiement (issue 06) : un seul par processus, même après HMR ; démarré seulement
 *   si `REDIS_URL` est défini. L'import reste dynamique pour ne charger BullMQ/ioredis qu'au besoin.
 */
export async function registerNode(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  assertCryptoConfig()

  if (process.env.REDIS_URL) {
    try {
      const { ensureDeploymentWorker } = await import('./instrumentation.worker')
      ensureDeploymentWorker()
    } catch (error) {
      console.error(
        '[eflex/worker] démarrage impossible :',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}
