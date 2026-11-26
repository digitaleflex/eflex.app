/** Helpers purs pour afficher l'utilisation du plan (applications). */

export type UsageLevel = 'ok' | 'warning' | 'full'

export function usageLevel(used: number, limit: number): UsageLevel {
  if (limit <= 0) return used > 0 ? 'full' : 'ok'
  if (used >= limit) return 'full'
  if (used / limit >= 0.8) return 'warning'
  return 'ok'
}

export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
}

export function usageLabel(level: UsageLevel): string {
  switch (level) {
    case 'full':
      return 'Quota atteint'
    case 'warning':
      return 'Proche de la limite'
    default:
      return 'Dans la limite'
  }
}

/** Limite lisible ; `null` quand aucune limite finie n'est définie (pas une promesse). */
export function formatLimit(limit: number): string | null {
  return Number.isFinite(limit) ? limit.toLocaleString('fr-FR') : null
}

/** « 1 / 5 » ou « 1 application » quand la limite n'est pas définie. */
export function formatUsageOf(used: number, limit: number): string {
  const formattedLimit = formatLimit(limit)
  if (formattedLimit === null) {
    const n = used.toLocaleString('fr-FR')
    return `${n} application${used > 1 ? 's' : ''}`
  }
  return `${used.toLocaleString('fr-FR')} / ${formattedLimit}`
}
