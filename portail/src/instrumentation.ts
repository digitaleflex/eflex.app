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
}
