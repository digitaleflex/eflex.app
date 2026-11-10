/**
 * Annulation d'un déploiement (issue 04).
 *
 * La décision et l'enchaînement sont purs (dépendances injectées) pour rester
 * testables sans Redis, PostgreSQL ni Coolify :
 *   1. `queued` → retirer le job BullMQ (le worker ne le traitera pas) ;
 *   2. déploiement déjà démarré → demander l'annulation à Coolify ;
 *   3. dans tous les cas, fixer l'état local à `cancelled`.
 *
 * Un échec Coolify n'empêche pas l'annulation locale : il est remonté comme
 * avertissement, car le build distant peut continuer sans nous.
 */
import { ACTIVE_DEPLOYMENT_STATUSES, isTerminal } from './deployment-state'

export const CANCELLABLE_STATUSES = ACTIVE_DEPLOYMENT_STATUSES

/** Ligne ajoutée au journal du déploiement, jamais écrasée. */
export const CANCEL_NOTE = 'Déploiement annulé à la demande de l’utilisateur.'

export type CancellationPlan =
  | { kind: 'cancel'; removeQueuedJob: boolean; coolifyBuildId: string | null }
  | { kind: 'refuse'; code: 'terminal' | 'unknown'; message: string }

/** Décide ce qu'il faut faire pour un déploiement donné, sans effet de bord. */
export function planCancellation(input: {
  status: string
  coolifyBuildId: string | null
}): CancellationPlan {
  if (isTerminal(input.status)) {
    return {
      kind: 'refuse',
      code: 'terminal',
      message: 'Ce déploiement est déjà terminé : il ne peut plus être annulé.',
    }
  }
  if (!(CANCELLABLE_STATUSES as readonly string[]).includes(input.status)) {
    return {
      kind: 'refuse',
      code: 'unknown',
      message: 'L’état de ce déploiement ne permet pas une annulation.',
    }
  }
  return {
    kind: 'cancel',
    removeQueuedJob: input.status === 'queued',
    coolifyBuildId: input.coolifyBuildId,
  }
}

export type RemoveJobResult = 'removed' | 'active' | 'missing' | 'error'

export interface CancelDeps {
  /** Retire le job BullMQ s'il attend encore. */
  removeQueuedJob: (deploymentId: string) => Promise<RemoveJobResult>
  /** Demande l'annulation du build distant (Coolify). */
  cancelCoolify: (
    coolifyBuildId: string,
  ) => Promise<{ ok: true; alreadyFinished?: boolean } | { error: string }>
  /**
   * Passe l'état local à `cancelled` de façon **conditionnelle** (uniquement si
   * le déploiement n'est pas déjà terminal). `false` = course perdue.
   */
  markCancelled: (deploymentId: string, note: string) => Promise<boolean>
}

export type CancelOutcome =
  | { ok: true; status: 'cancelled'; warning?: string }
  | { ok: false; code: 'terminal' | 'unknown' | 'race'; message: string; warning?: string }

export async function cancelDeployment(
  target: { id: string; status: string; coolifyBuildId: string | null },
  deps: CancelDeps,
): Promise<CancelOutcome> {
  const plan = planCancellation(target)
  if (plan.kind === 'refuse') {
    return { ok: false, code: plan.code, message: plan.message }
  }

  const warnings: string[] = []
  const coolifyBuildId = plan.coolifyBuildId

  if (plan.removeQueuedJob) {
    const removed = await deps.removeQueuedJob(target.id)
    if (removed === 'error') {
      warnings.push('La file de déploiement est injoignable : le job sera ignoré à son démarrage.')
    }
    // Course avec le worker : il a déjà pris le job, il faut arrêter Coolify.
    if (removed === 'active' && !coolifyBuildId) {
      warnings.push('Le worker a déjà pris ce déploiement ; l’hébergement va être arrêté.')
    }
  }

  if (coolifyBuildId) {
    const remote = await deps.cancelCoolify(coolifyBuildId)
    if ('error' in remote) {
      warnings.push(`L’hébergement n’a pas confirmé l’annulation : ${remote.error}`)
    }
  }

  const cancelled = await deps.markCancelled(target.id, CANCEL_NOTE)
  if (!cancelled) {
    return {
      ok: false,
      code: 'race',
      message: 'Ce déploiement s’est terminé avant l’annulation.',
      ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
    }
  }

  return {
    ok: true,
    status: 'cancelled',
    ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
  }
}
