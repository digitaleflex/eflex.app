/**
 * Chien de garde des déploiements (issue 05).
 *
 * Un déploiement peut rester bloqué (worker arrêté pendant un build, Coolify
 * muet, job perdu après un redémarrage) : sans surveillance il afficherait
 * « En cours » indéfiniment. Le watchdog passe en `failed` tout déploiement
 * non terminal plus vieux que le délai maximal.
 *
 * La logique est pure et reçoit ses dépendances : testable sans base ni Redis.
 */
import { isTerminal } from './deployment-state'

/** Délai maximal par défaut d'un déploiement (30 minutes). */
export const DEFAULT_DEPLOYMENT_TIMEOUT_MINUTES = 30

/** Fréquence d'exécution du watchdog dans le worker (une minute). */
export const WATCHDOG_INTERVAL_MS = 60_000

/**
 * Délai maximal effectif, en millisecondes. `DEPLOYMENT_TIMEOUT_MINUTES` permet
 * d'allonger le délai (builds très lourds) ; une valeur invalide est ignorée.
 */
export function deploymentTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.DEPLOYMENT_TIMEOUT_MINUTES ?? '', 10)
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DEPLOYMENT_TIMEOUT_MINUTES
  return minutes * 60_000
}

/** Message écrit dans `logsSummary` : contient toujours « délai dépassé ». */
export function deploymentTimeoutMessage(timeoutMs = deploymentTimeoutMs()): string {
  const minutes = Math.max(1, Math.round(timeoutMs / 60_000))
  return `Délai dépassé : le déploiement n’a pas abouti dans les ${minutes} minutes imparties. Il a été arrêté automatiquement.`
}

/** Vrai si le déploiement n'est pas terminal et dépasse le délai autorisé. */
export function isDeploymentExpired(
  input: { status: string; createdAt: Date },
  now: Date,
  timeoutMs: number,
): boolean {
  if (isTerminal(input.status)) return false
  return input.createdAt.getTime() <= now.getTime() - timeoutMs
}

export interface WatchdogDeps {
  /** Déploiements non terminaux créés avant `createdBefore`. */
  findExpired: (
    createdBefore: Date,
  ) => Promise<Array<{ id: string; status: string; createdAt: Date }>>
  /** Passe le déploiement en échec ; `false` si une autre transition a gagné. */
  fail: (deploymentId: string, message: string) => Promise<boolean>
}

export interface WatchdogResult {
  expired: number
  message: string
}

/**
 * Expire les déploiements bloqués. Idempotent : un déploiement déjà terminal
 * (dont `cancelled`) n'est jamais touché, et deux exécutions concurrentes ne
 * peuvent pas écraser un état plus récent (le `fail` est conditionnel).
 */
export async function expireStaleDeployments(
  deps: WatchdogDeps,
  options: { now?: Date; timeoutMs?: number } = {},
): Promise<WatchdogResult> {
  const now = options.now ?? new Date()
  const timeoutMs = options.timeoutMs ?? deploymentTimeoutMs()
  const message = deploymentTimeoutMessage(timeoutMs)
  const createdBefore = new Date(now.getTime() - timeoutMs)

  let expired = 0
  const candidates = await deps.findExpired(createdBefore)
  for (const candidate of candidates) {
    if (!isDeploymentExpired(candidate, now, timeoutMs)) continue
    if (await deps.fail(candidate.id, message)) expired += 1
  }
  return { expired, message }
}
