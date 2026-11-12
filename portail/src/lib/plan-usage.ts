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
