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
