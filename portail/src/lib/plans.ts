export type PlanId = 'free' | 'starter' | 'pro' | 'agency'

export interface Plan {
  id: PlanId
  label: string
  tagline: string
  priceFcfa: number
  projectLimit: number
  memberLimit: number
  customDomainLimit: number
  highlighted?: boolean
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    label: 'Découverte',
    tagline: 'Pour tester Eflex sur quelques projets.',
    priceFcfa: 0,
    projectLimit: 5,
    memberLimit: 5,
    customDomainLimit: 5,
  },
  starter: {
    id: 'starter',
    label: 'Starter',
    tagline: 'Pour un ou deux projets en production.',
    priceFcfa: 12_000,
    projectLimit: 10,
    memberLimit: 10,
    customDomainLimit: 10,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    tagline: 'Pour une équipe qui livre régulièrement.',
    priceFcfa: 29_000,
    projectLimit: 30,
    memberLimit: 25,
    customDomainLimit: 25,
    highlighted: true,
  },
  agency: {
    id: 'agency',
    label: 'Agence',
    tagline: 'Pour gérer les projets de plusieurs clients.',
    priceFcfa: 59_000,
    projectLimit: 100,
    memberLimit: 50,
    customDomainLimit: 50,
  },
}

export const PLAN_IDS: PlanId[] = ['free', 'starter', 'pro', 'agency']

/** Durée facturée d'une période et durée de grâce après un impayé. */
export const PERIOD_DAYS = 30
export const GRACE_PERIOD_DAYS = 7

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as string[]).includes(value)
}

export function planById(value: string | null | undefined): Plan {
  return isPlanId(value) ? PLANS[value] : PLANS.free
}

/** Un abonnement ne donne ses limites que s'il est réellement actif. */
export function isActiveSubscription(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing'
}

export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} FCFA`
}

export function formatPrice(priceFcfa: number): string {
  if (priceFcfa === 0) return 'Gratuit'
  return `${formatFcfa(priceFcfa)} / mois`
}
