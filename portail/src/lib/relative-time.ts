const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

/** « il y a 5 minutes », « hier »… ; au-delà d'une semaine, la date. */
export function relativeTime(date: Date | string, now = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return "à l'instant"
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), 'day')
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(d)
}
