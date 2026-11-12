export type HealthTone = 'success' | 'warning' | 'danger' | 'muted'

export interface HealthView {
  label: string
  detail: string | null
  tone: HealthTone
}

export interface RuntimeHealthInput {
  status: string | null | undefined
  healthCheckEnabled?: boolean
  healthCheckPath?: string | null
  restartCount?: number | null
  lastRestartAt?: string | null
  restartReason?: string | null
}

/** Statut du conteneur Coolify, traduit en libellé utilisateur. */
export function applicationHealth(status: string | null | undefined): HealthView {
  if (!status) return { label: 'Statut indisponible', detail: null, tone: 'muted' }
  if (status.startsWith('restarting')) return { label: 'Redémarrage', detail: 'Le conteneur redémarre.', tone: 'warning' }
  if (status.startsWith('starting')) return { label: 'Démarrage', detail: 'Le conteneur démarre.', tone: 'warning' }
  if (status.startsWith('running')) {
    return status.includes('unhealthy')
      ? { label: 'Healthcheck en échec', detail: 'Le conteneur tourne mais le healthcheck échoue.', tone: 'warning' }
      : { label: 'En ligne', detail: 'Le conteneur tourne.', tone: 'success' }
  }
  if (status.startsWith('exited') || status.startsWith('stopped')) {
    return { label: 'Arrêtée', detail: 'Le conteneur est arrêté.', tone: 'muted' }
  }
  return { label: 'Inconnu', detail: status, tone: 'muted' }
}

const dt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Enrichit l'état santé avec les détails runtime connus (sonde, redémarrages). */
export function runtimeHealth(input: RuntimeHealthInput): HealthView {
  const base = applicationHealth(input.status)
  const details: string[] = []
  if (base.detail) details.push(base.detail)
  if (input.healthCheckEnabled && input.healthCheckPath) {
    details.push(`Sonde : ${input.healthCheckPath}`)
  } else if (input.healthCheckEnabled) {
    details.push('Sonde de santé activée.')
  }
  if (typeof input.restartCount === 'number' && Number.isFinite(input.restartCount)) {
    details.push(`Redémarrages : ${input.restartCount}`)
  }
  if (input.lastRestartAt) {
    const d = new Date(input.lastRestartAt)
    const when = Number.isNaN(d.getTime()) ? input.lastRestartAt : dt.format(d)
    details.push(`Dernier redémarrage : ${when}${input.restartReason ? ` (${input.restartReason})` : ''}`)
  } else if (input.restartReason) {
    details.push(`Dernier redémarrage : ${input.restartReason}`)
  }
  return { ...base, detail: details.length > 0 ? details.join(' · ') : null }
}

const DAY_MS = 86_400_000
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

/** État du certificat SSL stocké après le dernier déploiement. */
export function tlsHealth(
  valid: boolean | null,
  expiresAt: Date | null,
  checkedAt: Date | null,
  now = Date.now(),
): HealthView {
  if (valid === true && expiresAt) {
    const days = Math.ceil((expiresAt.getTime() - now) / DAY_MS)
    if (days <= 0) return { label: 'Certificat expiré', detail: `Expiré le ${dateFormat.format(expiresAt)}.`, tone: 'danger' }
    if (days <= 14) return { label: 'Expire bientôt', detail: `Expire le ${dateFormat.format(expiresAt)} (${days} j).`, tone: 'warning' }
    return { label: 'HTTPS valide', detail: `Expire le ${dateFormat.format(expiresAt)}.`, tone: 'success' }
  }
  if (valid === false) return { label: 'Certificat invalide', detail: 'Le dernier contrôle TLS a échoué.', tone: 'danger' }
  if (checkedAt) return { label: 'Non vérifié', detail: `Dernier contrôle : ${dateFormat.format(checkedAt)}.`, tone: 'muted' }
  return { label: 'Pas encore vérifié', detail: 'Le certificat sera contrôlé après le prochain déploiement.', tone: 'muted' }
}
