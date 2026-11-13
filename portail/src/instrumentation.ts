/**
 * Point d'entrée d'instrumentation de Next.js (`register`).
 *
 * Tout le code Node (validation de la clé de chiffrement, worker BullMQ/ioredis) vit dans
 * `instrumentation-node.ts`, importé derrière une condition EN LIGNE sur `NEXT_RUNTIME` :
 * le bundler retire alors cet import du bundle edge. Un `return` anticipé ne suffit pas —
 * en développement, l'import dynamique serait quand même résolu pour edge (ioredis →
 * redis-parser → `string_decoder` introuvable) et toutes les pages répondraient 500 (#101).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node')
    await registerNode()
  }
}
