/**
 * Réconciliation « base → file » (audit M4).
 *
 * Redis tourne sans persistance : un redémarrage efface les jobs BullMQ alors
 * que les déploiements restent `queued`/en cours en base. Au démarrage du
 * worker (puis périodiquement), on ré-enfile les déploiements non terminaux
 * dont le job a disparu. Un job encore présent (en attente, actif, différé…)
 * n'est jamais touché : pas de double traitement.
 *
 * Logique pure : les dépendances sont injectées, testable sans base ni Redis.
 */

export interface ReconcilableDeployment {
  id: string
  rollback: boolean
}

export interface ReconcileDeps {
  /** Déploiements non terminaux, les plus anciens d'abord. */
  findPending: (limit: number) => Promise<ReconcilableDeployment[]>
  /** Vrai si un job existe encore dans la file (quel que soit son état). */
  hasJob: (deploymentId: string) => Promise<boolean>
  enqueue: (deploymentId: string, options: { rollback: boolean }) => Promise<void>
  log?: (message: string) => void
}

export interface ReconcileResult {
  checked: number
  reenqueued: string[]
  errors: number
}

export const RECONCILE_BATCH = 200
export const RECONCILE_INTERVAL_MS = 5 * 60_000

export async function reconcileDeploymentQueue(deps: ReconcileDeps): Promise<ReconcileResult> {
  const pending = await deps.findPending(RECONCILE_BATCH)
  const result: ReconcileResult = { checked: pending.length, reenqueued: [], errors: 0 }

  for (const deployment of pending) {
    try {
      if (await deps.hasJob(deployment.id)) continue
      await deps.enqueue(deployment.id, { rollback: deployment.rollback })
      result.reenqueued.push(deployment.id)
      deps.log?.(`déploiement ${deployment.id} ré-enfilé (job absent de la file)`)
    } catch (error) {
      result.errors += 1
      deps.log?.(
        `réconciliation impossible pour ${deployment.id} : ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return result
}
