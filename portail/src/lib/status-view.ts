/**
 * Mise en forme de l'état des services : dates, fraîcheur du relevé et libellés
 * des pourcentages. Module pur, testable sans base ni réseau.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
})

const PERCENT_FORMATTER = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
})

const COUNT_FORMATTER = new Intl.NumberFormat('fr-FR')

/** Horodatage lisible, toujours en UTC pour éviter toute ambiguïté de fuseau. */
export function formatStatusDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'heure inconnue'
  return `${DATE_FORMATTER.format(date)} UTC`
}

/** Ancienneté du relevé, arrondie vers le bas et jamais négative. */
export function observedAge(checkedAt: string, now: number = Date.now()): string {
  const date = new Date(checkedAt)
  if (Number.isNaN(date.getTime())) return 'heure inconnue'

  const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'il y a moins d’une minute'

  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`

  const days = Math.floor(hours / 24)
  return `il y a ${days} jour${days > 1 ? 's' : ''}`
}

/** Pourcentage à une décimale, ou tiret cadratin tant qu'aucun relevé n'existe. */
export function uptimePercentLabel(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '—'
  return `${PERCENT_FORMATTER.format(percent)} %`
}

/** Nombre de relevés exploitable dans une phrase (« 42 relevés »). */
export function sampleCountLabel(samples: number): string {
  const count = Math.max(0, Math.trunc(samples))
  if (count === 0) return 'aucun relevé exploitable'
  return `${COUNT_FORMATTER.format(count)} relevé${count > 1 ? 's' : ''}`
}
