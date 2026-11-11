/**
 * Machine à états des déploiements (issue 06).
 * `queued → analyzing → provisioning → building → deploying → live | failed | cancelled`
 * Pure et synchrone : aucune dépendance, facilement testable.
 */
export const DEPLOYMENT_STATUSES = [
  'queued',
  'analyzing',
  'provisioning',
  'building',
  'deploying',
  'live',
  'failed',
  'cancelled',
] as const

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

const TRANSITIONS: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  queued: ['analyzing', 'failed', 'cancelled'],
  analyzing: ['provisioning', 'failed', 'cancelled'],
  provisioning: ['building', 'failed', 'cancelled'],
  building: ['deploying', 'failed', 'cancelled'],
  deploying: ['live', 'failed', 'cancelled'],
  live: [],
  failed: [],
  cancelled: [],
}

/** États sans retour possible : plus aucune transition n'est autorisée. */
export const TERMINAL_STATUSES = ['live', 'failed', 'cancelled'] as const

/** États d'un déploiement qui n'a pas encore d'issue (verrou « un seul à la fois »). */
export const ACTIVE_DEPLOYMENT_STATUSES = [
  'queued',
  'analyzing',
  'provisioning',
  'building',
  'deploying',
] as const

const TERMINAL: ReadonlySet<DeploymentStatus> = new Set(TERMINAL_STATUSES)

export const STATUS_LABELS: Record<DeploymentStatus, string> = {
  queued: 'En file d’attente',
  analyzing: 'Analyse du dépôt',
  provisioning: 'Préparation de l’application',
  building: 'Construction de l’image',
  deploying: 'Déploiement en cours',
  live: 'En ligne',
  failed: 'Échec',
  cancelled: 'Annulé',
}

/** Résultat de l’agrégation d’un lot de déploiements partageant un `groupId`. */
export type DeploymentGroupAggregate = {
  /** Le lot est terminé quand tous ses déploiements sont dans un état terminal. */
  complete: boolean
  total: number
  live: number
  failed: number
  cancelled: number
  active: number
  /** État agrégé stable, utilisable dans une clé de déduplication. */
  outcome: 'in-progress' | 'all-live' | 'all-failed' | 'all-cancelled' | 'mixed'
}

/**
 * Calcule l’état d’un lot de déploiements. Les statuts inconnus sont traités
 * comme non terminaux (le lot reste « en cours » tant qu’ils ne sont pas tous
 * résolus), ce qui évite une notification prématurée.
 */
export function aggregateDeploymentGroup(statuses: readonly string[]): DeploymentGroupAggregate {
  let live = 0
  let failed = 0
  let cancelled = 0
  let active = 0
  for (const status of statuses) {
    if (status === 'live') live += 1
    else if (status === 'failed') failed += 1
    else if (status === 'cancelled') cancelled += 1
    else active += 1
  }
  const total = statuses.length
  const complete = total > 0 && active === 0
  let outcome: DeploymentGroupAggregate['outcome'] = 'in-progress'
  if (complete) {
    if (live === total) outcome = 'all-live'
    else if (failed === total) outcome = 'all-failed'
    else if (cancelled === total) outcome = 'all-cancelled'
    else outcome = 'mixed'
  }
  return { complete, total, live, failed, cancelled, active, outcome }
}

export function isDeploymentStatus(value: string): value is DeploymentStatus {
  return (DEPLOYMENT_STATUSES as readonly string[]).includes(value)
}

export function isTerminal(status: string): boolean {
  return isDeploymentStatus(status) && TERMINAL.has(status)
}

export function canTransition(from: string, to: DeploymentStatus): boolean {
  return isDeploymentStatus(from) && TRANSITIONS[from].includes(to)
}

/** Lève une erreur si la transition est interdite (garde-fou côté worker). */
export function assertTransition(from: string, to: DeploymentStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transition de déploiement interdite : "${from}" → "${to}".`)
  }
}
