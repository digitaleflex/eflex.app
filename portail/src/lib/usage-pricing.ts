/**
 * Tarification à l'usage (issue #143, lot « mesure ») — calcul pur, sans accès base ni débit.
 * On facture la ressource RÉSERVÉE (limite configurée), arrondie à l'heure supérieure, jamais la consommation instantanée.
 * Les tarifs sont ceux de l'issue, à calibrer sur le coût réel du serveur : tout vient de `USAGE_RATES_FCFA`.
 */
export const USAGE_RATES_FCFA = {
  /** Application de 512 Mo, par heure. */
  appBase512PerHour: 2,
  /** Chaque tranche supplémentaire de 256 Mo, par heure. */
  ramExtra256PerHour: 1,
  /** Base PostgreSQL managée, par heure. */
  databasePerHour: 3,
  /** Build au-delà du quota gratuit mensuel. */
  buildExtra: 25,
} as const

export const FREE_BUILDS_PER_MONTH = 30
export const TOPUP_AMOUNTS_FCFA = [2000, 5000, 10000, 25000] as const

export function billableHours(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return ms > 0 ? Math.ceil(ms / 3_600_000) : 0
}

/** Coût horaire d'une application selon sa mémoire réservée (Mo). Moins de 512 Mo = tarif de base. */
export function appHourlyRate(memoryMb: number): number {
  const mb = Number.isFinite(memoryMb) && memoryMb > 0 ? memoryMb : 512
  const extraSteps = Math.max(0, Math.ceil((mb - 512) / 256))
  return USAGE_RATES_FCFA.appBase512PerHour + extraSteps * USAGE_RATES_FCFA.ramExtra256PerHour
}

export interface UsageLine {
  kind: 'app' | 'database' | 'builds'
  label: string
  hours?: number
  quantity?: number
  amountFcfa: number
}

export function priceApp(memoryMb: number, start: Date, end: Date, label = 'Application'): UsageLine {
  const hours = billableHours(start, end)
  return { kind: 'app', label, hours, amountFcfa: hours * appHourlyRate(memoryMb) }
}

export function priceDatabase(start: Date, end: Date, label = 'Base PostgreSQL'): UsageLine {
  const hours = billableHours(start, end)
  return { kind: 'database', label, hours, amountFcfa: hours * USAGE_RATES_FCFA.databasePerHour }
}

export function priceBuilds(buildsInMonth: number): UsageLine {
  const extra = Math.max(0, Math.floor(buildsInMonth) - FREE_BUILDS_PER_MONTH)
  return { kind: 'builds', label: 'Builds hors quota', quantity: extra, amountFcfa: extra * USAGE_RATES_FCFA.buildExtra }
}

/** Plafond mensuel optionnel : ramène le total au plafond et indique s'il a joué. */
export function applyMonthlyCap(totalFcfa: number, capFcfa: number | null | undefined): { totalFcfa: number; capped: boolean } {
  if (capFcfa == null || !Number.isFinite(capFcfa) || capFcfa < 0) return { totalFcfa, capped: false }
  return totalFcfa > capFcfa ? { totalFcfa: capFcfa, capped: true } : { totalFcfa, capped: false }
}

export function isValidTopup(amountFcfa: number): boolean {
  return (TOPUP_AMOUNTS_FCFA as readonly number[]).includes(amountFcfa)
}

/** Jours de crédit restants au rythme actuel (null si aucune dépense). */
export function daysOfCreditLeft(creditFcfa: number, spentLast7DaysFcfa: number): number | null {
  if (spentLast7DaysFcfa <= 0) return null
  return Math.floor(creditFcfa / (spentLast7DaysFcfa / 7))
}

/** Seuils d'alerte `billing.credit_low` : 7, 3 et 1 jour restants (le plus bas franchi). */
export function creditAlertThreshold(daysLeft: number | null): 7 | 3 | 1 | null {
  if (daysLeft == null) return null
  if (daysLeft <= 1) return 1
  if (daysLeft <= 3) return 3
  if (daysLeft <= 7) return 7
  return null
}
