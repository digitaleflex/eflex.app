/**
 * Sélectionne un seul bandeau à afficher, par priorité décroissante.
 * Module pur, testé.
 */

export type BannerKind = 'impersonation' | 'suspension' | 'past_due' | 'maintenance' | 'announcement'

export interface BannerCandidate {
  kind: BannerKind
  /** Vrai si le bandeau peut être fermé par l'utilisateur. */
  dismissible: boolean
}

const PRIORITY: Record<BannerKind, number> = {
  impersonation: 5,
  suspension: 4,
  past_due: 3,
  maintenance: 2,
  announcement: 1,
}

/** Retourne le bandeau prioritaire parmi ceux actifs, ou null. */
export function selectBanner(active: readonly BannerKind[]): BannerKind | null {
  if (active.length === 0) return null
  let best: BannerKind | null = null
  for (const kind of active) {
    if (!best || PRIORITY[kind] > PRIORITY[best]) best = kind
  }
  return best
}

export function isDismissible(kind: BannerKind): boolean {
  // Bloquants (impersonation/suspension/past_due/maintenance) : non fermables.
  return kind === 'announcement'
}
