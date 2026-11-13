/**
 * Point d'entrée de l'instrumentation Next.js.
 *
 * Next compile ce fichier pour les runtimes Node.js **et** edge. Le code Node
 * (validation de la clé de chiffrement, worker BullMQ / ioredis) vit dans
 * `instrumentation-node.ts` et n'est importé que derrière une condition en
 * ligne sur `NEXT_RUNTIME` : avec un `return` anticipé, webpack incluait
 * quand même l'import dans le bundle edge et `next dev` renvoyait 500 sur
 * toutes les pages (`Can't resolve 'string_decoder'`, PUB-13, #101).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node')
    await registerNode()
  }
}
