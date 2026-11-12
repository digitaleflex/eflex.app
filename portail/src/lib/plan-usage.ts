/**
 * Consommation du quota d'applications affichée dans la barre latérale.
 * Module pur : testable sans DOM ni base.
 */

export type PlanUsageTone = 'ok' | 'warning' | 'full'

export interface PlanUsage {
  used: number
  limit: number
  /** Part du quota consommée, bornée à 0–100 (jamais de barre qui déborde). */
  percent: number
  tone: PlanUsageTone
  /** Texte lisible, ex. « 3 / 10 applications ». */
  label: string
}

/** Seuil à partir duquel on prévient qu'on approche de la limite. */
export const PLAN_USAGE_WARNING_PERCENT = 80

export function planUsage(used: number, limit: number): PlanUsage {
  const safeUsed = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0
  const ratio = safeLimit === 0 ? (safeUsed > 0 ? 1 : 0) : safeUsed / safeLimit
  const percent = Math.min(100, Math.round(ratio * 100))
  const tone: PlanUsageTone = ratio >= 1 ? 'full' : percent >= PLAN_USAGE_WARNING_PERCENT ? 'warning' : 'ok'
  return {
    used: safeUsed,
    limit: safeLimit,
    percent,
    tone,
    label: `${safeUsed} / ${safeLimit} application${safeLimit > 1 ? 's' : ''}`,
  }
}
