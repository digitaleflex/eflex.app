/** Fonctions pures du module de statut (testables sans réseau ni base). */

export type ComponentState = 'ok' | 'degraded' | 'down' | 'unknown'
export type OverallState = 'ok' | 'degraded' | 'down'

export const STATE_LABELS: Record<ComponentState, string> = {
  ok: 'Opérationnel',
  degraded: 'Dégradé',
  down: 'Indisponible',
  unknown: 'Non surveillé',
}

export const OVERALL_LABELS: Record<OverallState, string> = {
  ok: 'Tous les services sont opérationnels',
  degraded: 'Service dégradé',
  down: 'Service indisponible',
}

/**
 * Une panne du portail ou de la base est critique ; une panne d'un service
 * périphérique (Redis, Coolify, moteur Axiom) dégrade seulement la plateforme.
 */
export function computeOverall(
  components: { key: string; state: ComponentState }[]
): OverallState {
  const critical = components.filter((c) => c.key === 'portal' || c.key === 'database')
  if (critical.some((c) => c.state === 'down')) return 'down'
  if (components.some((c) => c.state === 'down' || c.state === 'degraded')) return 'degraded'
  return 'ok'
}

/** Pourcentage arrondi à une décimale, ou `null` tant qu'aucun relevé n'existe. */
export function uptimePercent(ok: number, total: number): number | null {
  if (total <= 0) return null
  const ratio = Math.max(0, Math.min(1, ok / total))
  return Math.round(ratio * 1000) / 10
}
