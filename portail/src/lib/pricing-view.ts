import { GRACE_PERIOD_DAYS, PERIOD_DAYS, PLAN_IDS, PLANS, formatPrice, type Plan, type PlanId } from '@/lib/plans'

/**
 * Préparation des plans pour la page publique `/tarifs`.
 *
 * Fonction pure : prix, libellés et limites viennent uniquement de `PLANS`
 * (`lib/plans.ts`). Aucun montant n'est recopié ailleurs, la page et le test
 * lisent la même source.
 */

export type PricingLimitKey = 'apps' | 'members' | 'domains'

export interface PricingLimit {
  key: PricingLimitKey
  /** Libellé de ligne du comparatif. */
  label: string
  value: number
  /** Valeur formatée en français (séparateur de milliers). */
  display: string
  /** Phrase complète pour la liste de la carte (« 30 applications déployables »). */
  sentence: string
}

export interface PricingPlanView {
  id: PlanId
  label: string
  tagline: string
  priceFcfa: number
  isFree: boolean
  /** Prix complet : « Gratuit » ou « 12 000 FCFA / mois » (identique à `formatPrice`). */
  priceLabel: string
  /** Montant seul, mis en valeur dans la carte (« 12 000 »), `null` pour le gratuit. */
  amount: string | null
  /** Unité affichée après le montant, `null` pour le gratuit. */
  unit: string | null
  highlighted: boolean
  limits: PricingLimit[]
}

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

export function formatCount(value: number): string {
  return numberFormat.format(value)
}

const plural = (value: number, singular: string, pluralForm: string) => (value > 1 ? pluralForm : singular)

/** Libellés de ligne du comparatif, dans l'ordre d'affichage. */
export const PRICING_LIMIT_LABELS: Record<PricingLimitKey, string> = {
  apps: 'Applications déployables',
  members: 'Membres de l’organisation',
  domains: 'Domaines personnalisés par projet',
}

export function planLimits(plan: Plan): PricingLimit[] {
  const apps = plan.projectLimit
  const members = plan.memberLimit
  const domains = plan.customDomainLimit
  return [
    {
      key: 'apps',
      label: PRICING_LIMIT_LABELS.apps,
      value: apps,
      display: formatCount(apps),
      sentence: `${formatCount(apps)} ${plural(apps, 'application déployable', 'applications déployables')}`,
    },
    {
      key: 'members',
      label: PRICING_LIMIT_LABELS.members,
      value: members,
      display: formatCount(members),
      sentence: `${formatCount(members)} ${plural(members, 'membre', 'membres')} dans l’organisation`,
    },
    {
      key: 'domains',
      label: PRICING_LIMIT_LABELS.domains,
      value: domains,
      display: formatCount(domains),
      sentence: `${formatCount(domains)} ${plural(domains, 'domaine personnalisé', 'domaines personnalisés')} par projet`,
    },
  ]
}

export function pricingPlan(plan: Plan): PricingPlanView {
  const isFree = plan.priceFcfa === 0
  return {
    id: plan.id,
    label: plan.label,
    tagline: plan.tagline,
    priceFcfa: plan.priceFcfa,
    isFree,
    priceLabel: formatPrice(plan.priceFcfa),
    amount: isFree ? null : formatCount(plan.priceFcfa),
    unit: isFree ? null : 'FCFA / mois',
    highlighted: plan.highlighted === true,
    limits: planLimits(plan),
  }
}

/** Tous les plans, dans l'ordre de `PLAN_IDS`. */
export function pricingPlans(): PricingPlanView[] {
  return PLAN_IDS.map((id) => pricingPlan(PLANS[id]))
}

/** Durées de facturation, exposées pour les textes de la FAQ. */
export const BILLING_TERMS = {
  periodDays: PERIOD_DAYS,
  graceDays: GRACE_PERIOD_DAYS,
} as const
