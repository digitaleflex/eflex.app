export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'

export type StatusInfo = {
  label: string
  tone: StatusTone
  /** Déploiement qui n'a pas encore d'issue : la page se met à jour toute seule. */
  inProgress: boolean
}

const STATUSES: Record<string, StatusInfo> = {
  live: { label: 'En ligne', tone: 'success', inProgress: false },
  building: { label: 'Build en cours', tone: 'warning', inProgress: true },
  deploying: { label: 'Mise en ligne…', tone: 'warning', inProgress: true },
  pending: { label: 'En attente', tone: 'neutral', inProgress: true },
  queued: { label: 'En file d’attente', tone: 'neutral', inProgress: true },
  analyzing: { label: 'Analyse du dépôt', tone: 'warning', inProgress: true },
  provisioning: { label: 'Préparation', tone: 'warning', inProgress: true },
  cancelled: { label: 'Annulé', tone: 'neutral', inProgress: false },
  failed: { label: 'Échec', tone: 'danger', inProgress: false },
  rollbacked: { label: 'Annulé', tone: 'neutral', inProgress: false },
}

const NONE: StatusInfo = { label: 'Jamais déployé', tone: 'neutral', inProgress: false }

export function statusInfo(status: string | null | undefined): StatusInfo {
  if (!status) return NONE
  return STATUSES[status] ?? { label: status, tone: 'neutral', inProgress: false }
}

/** Ordre de tri « à regarder d'abord » : échec, en cours, en attente, puis le reste. */
export function attentionRank(status: string | null | undefined): number {
  const info = statusInfo(status)
  if (info.tone === 'danger') return 0
  if (info.inProgress && info.tone === 'warning') return 1
  if (info.inProgress) return 2
  return 3
}
