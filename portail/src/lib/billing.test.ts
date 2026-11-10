import { describe, expect, it } from 'vitest'
import {
  computeBillingState,
  effectiveLimits,
  graceDeadline,
  nextPeriodEnd,
  prorationCreditFcfa,
  upgradeMessage,
} from './billing'
import { PLANS, formatFcfa } from './plans'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY)

type SubscriptionRow = NonNullable<
  Parameters<typeof computeBillingState>[0]['subscription']
>

function subscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    status: 'active',
    plan: 'pro',
    pendingPlan: null,
    currentPeriodEnd: at(20),
    graceUntil: null,
    creditFcfa: 0,
    manualOverride: false,
    projectLimitOverride: null,
    memberLimitOverride: null,
    quotaOverrideUntil: null,
    ...overrides,
  }
}

function state(subscriptionRow: SubscriptionRow | null, overrides: { suspendedAt?: Date | null } = {}) {
  return computeBillingState(
    {
      organizationId: 'org_1',
      suspendedAt: overrides.suspendedAt ?? null,
      suspensionReason: overrides.suspendedAt ? 'Impayé chronique' : null,
      subscription: subscriptionRow,
    },
    NOW,
  )
}

describe('état de facturation', () => {
  it('applique le plan payant pendant une période active', () => {
    const result = state(subscription())
    expect(result.phase).toBe('active')
    expect(result.plan.id).toBe('pro')
    expect(result.blocked).toBe(false)
    expect(result.limits.projects).toBe(PLANS.pro.projectLimit)
    expect(result.message).toBeNull()
  })

  it('conserve les limites payantes pendant la grâce d’un impayé', () => {
    const result = state(subscription({ status: 'past_due', graceUntil: at(5) }))
    expect(result.phase).toBe('past_due')
    expect(result.plan.id).toBe('pro')
    expect(result.blocked).toBe(false)
    expect(result.blockCode).toBeNull()
    expect(result.graceDaysLeft).toBe(5)
    expect(result.message).toBeNull()
  })

  it('bloque les nouveaux déploiements après la grâce, sans changer les limites affichées en grâce', () => {
    const result = state(subscription({ status: 'past_due', graceUntil: at(-1) }))
    expect(result.phase).toBe('past_due')
    expect(result.plan.id).toBe('free')
    expect(result.blocked).toBe(true)
    expect(result.blockCode).toBe('payment_past_due')
    expect(result.message).toContain('paiement')
    expect(result.message).toContain('applications déjà en ligne')
  })

  it('bloque immédiatement une organisation suspendue, même payante', () => {
    const result = state(subscription(), { suspendedAt: at(-2) })
    expect(result.suspended).toBe(true)
    expect(result.blocked).toBe(true)
    expect(result.blockCode).toBe('organization_suspended')
    expect(result.message).toContain('suspendue')
    expect(result.message).toContain('Impayé chronique')
  })

  it('retombe sur le plan gratuit quand la période est échue, sans bloquer les déploiements', () => {
    const result = state(subscription({ currentPeriodEnd: at(-1) }))
    expect(result.phase).toBe('expired')
    expect(result.expired).toBe(true)
    expect(result.plan.id).toBe('free')
    expect(result.blocked).toBe(false)
  })

  it('applique les quotas dérogatoires seulement jusqu’à leur date', () => {
    const future = state(subscription({ projectLimitOverride: 80, memberLimitOverride: 40, quotaOverrideUntil: at(10) }))
    expect(future.limits.projects).toBe(80)
    expect(future.limits.members).toBe(40)
    const past = state(subscription({ projectLimitOverride: 80, quotaOverrideUntil: at(-1) }))
    expect(past.limits.projects).toBe(PLANS.pro.projectLimit)
  })

  it('une demande en attente reste au plan gratuit sans blocage', () => {
    const result = state(subscription({ status: 'pending', plan: 'starter', currentPeriodEnd: null, pendingPlan: 'starter' }))
    expect(result.phase).toBe('pending')
    expect(result.plan.id).toBe('free')
    expect(result.pendingPlan).toBe('starter')
    expect(result.blocked).toBe(false)
  })

  it('sans abonnement : plan gratuit, aucune grâce, aucun blocage', () => {
    const result = state(null)
    expect(result.status).toBe('free')
    expect(result.phase).toBe('free')
    expect(result.plan.id).toBe('free')
    expect(result.blocked).toBe(false)
    expect(result.limits.projects).toBe(PLANS.free.projectLimit)
  })

  it('calcule les limites effectives hors abonnement', () => {
    expect(effectiveLimits(PLANS.starter).projects).toBe(PLANS.starter.projectLimit)
  })
})

describe('règles de prorata et de dates', () => {
  it('crédite les jours restants sur 30, plafonné à une période', () => {
    expect(prorationCreditFcfa(PLANS.pro, at(15), NOW)).toBe(14_500)
    expect(prorationCreditFcfa(PLANS.agency, at(60), NOW)).toBe(PLANS.agency.priceFcfa)
    expect(prorationCreditFcfa(PLANS.free, at(15), NOW)).toBe(0)
    expect(prorationCreditFcfa(PLANS.pro, null, NOW)).toBe(0)
    expect(prorationCreditFcfa(PLANS.pro, at(-1), NOW)).toBe(0)
  })

  it('prolonge de 30 jours depuis l’échéance future, sinon depuis maintenant', () => {
    expect(nextPeriodEnd(at(10), NOW).toISOString()).toBe(at(40).toISOString())
    expect(nextPeriodEnd(at(-10), NOW).toISOString()).toBe(at(30).toISOString())
    expect(nextPeriodEnd(null, NOW).toISOString()).toBe(at(30).toISOString())
  })

  it('fixe la fin de grâce à 7 jours après l’échéance', () => {
    expect(graceDeadline(at(3), NOW).toISOString()).toBe(at(10).toISOString())
    expect(graceDeadline(at(-30), NOW).toISOString()).toBe(at(7).toISOString())
  })

  it('formate les montants en FCFA au format français', () => {
    expect(formatFcfa(12_000)).toMatch(/^12\s000\sFCFA$/)
    expect(formatFcfa(0)).toBe('0 FCFA')
  })

  it('invite au plan supérieur avec un message explicite', () => {
    expect(upgradeMessage(PLANS.free, 'projets', 5)).toContain('plan supérieur')
    expect(upgradeMessage(PLANS.free, 'membres', 5)).toContain('5 membres')
  })
})
