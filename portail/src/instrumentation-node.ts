/**
 * Démarrage côté Node.js uniquement, appelé par `instrumentation.ts`.
 *
 * Ce module n'est importé que derrière une condition en ligne sur
 * `NEXT_RUNTIME === 'nodejs'` : Next ne l'inclut donc pas dans la compilation
 * edge de l'instrumentation, qui échouerait sur les modules Node de BullMQ /
 * ioredis (`string_decoder`, etc.) et casserait toutes les pages en `next dev`
 * (PUB-13, #101).
 */
import { assertCryptoConfig } from './lib/crypto'

export async function registerNode(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  // Validation au démarrage (issue 04) : en production, le portail refuse de
  // démarrer si la clé de chiffrement des variables est absente.
  assertCryptoConfig()

  // Worker de déploiement (issue 06) : un seul par processus, même après HMR.
  if (process.env.REDIS_URL) {
    try {
      const { startDeploymentWorker } = await import('./worker')
      const globalForWorker = globalThis as unknown as { __eflexWorker?: unknown }
      if (!globalForWorker.__eflexWorker) {
        globalForWorker.__eflexWorker = startDeploymentWorker()
        console.info('[eflex/worker] file de déploiement démarrée')
      }
    } catch (error) {
      console.error(
        '[eflex/worker] démarrage impossible :',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}
