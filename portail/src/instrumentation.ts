/**
 * Validation au démarrage du serveur (issue 04) : en production, le portail
 * refuse de démarrer si la clé de chiffrement des variables est absente.
 * L'import est dynamique pour rester compatible avec les deux runtimes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { assertCryptoConfig } = await import('./lib/crypto')
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
