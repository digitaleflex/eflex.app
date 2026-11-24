/**
 * Démonstration illustrative « Code → EFLEX → Production » (accueil, Zone 2, issue #218).
 * Logique pure : l'état affiché pour chaque étape dépend uniquement de l'étape active, pour qu'aucun
 * déploiement ne soit jamais « en cours » et « en production » en même temps.
 */
export const STEP_IDS = ['analyse', 'build', 'orchestration', 'production'] as const
export type StepId = (typeof STEP_IDS)[number]
export type StepStatus = 'done' | 'current' | 'waiting'

export const LAST_STEP = STEP_IDS.length - 1

export function stepStatus(index: number, active: number): StepStatus {
  if (index < active) return 'done'
  if (index === active) return 'current'
  return 'waiting'
}

/** Étape suivante de la séquence illustrative ; `null` à la fin (la séquence ne boucle jamais). */
export function nextStep(active: number): number | null {
  return active < LAST_STEP ? active + 1 : null
}

/** L'application n'est visible dans le résultat qu'à la dernière étape. */
export function resultVisible(active: number): boolean {
  return active === LAST_STEP
}

export const SEQUENCE_INTERVAL_MS = 3400
