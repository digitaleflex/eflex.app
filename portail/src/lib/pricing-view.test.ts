import { describe, expect, it } from 'vitest'
import { GRACE_PERIOD_DAYS, PERIOD_DAYS, PLAN_IDS, PLANS } from '@/lib/plans'
import { BILLING_TERMS, pricingPlans } from '@/lib/pricing-view'

// La page publique /tarifs ne doit afficher que ce que dit `PLANS` : même ordre,
// même prix, mêmes limites, aucune valeur recopiée à la main.

const fr = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)

describe('pricingPlans', () => {
  const view = pricingPlans()

  it('rend chaque plan de PLANS, dans l’ordre de PLAN_IDS', () => {
    expect(view.map((plan) => plan.id)).toEqual(PLAN_IDS)
  })

  for (const id of PLAN_IDS) {
    const plan = PLANS[id]

    describe(`plan ${plan.label}`, () => {
      const rendered = view.find((entry) => entry.id === id)!

      it('reprend le libellé, l’accroche et le prix tels quels', () => {
        expect(rendered.label).toBe(plan.label)
        expect(rendered.tagline).toBe(plan.tagline)
        expect(rendered.priceFcfa).toBe(plan.priceFcfa)
        if (plan.priceFcfa === 0) {
          expect(rendered.priceLabel).toBe('Gratuit')
          expect(rendered.amount).toBeNull()
          expect(rendered.unit).toBeNull()
        } else {
          expect(rendered.priceLabel).toBe(`${fr(plan.priceFcfa)} FCFA / mois`)
          expect(rendered.amount).toBe(fr(plan.priceFcfa))
          expect(rendered.unit).toBe('FCFA / mois')
        }
      })

      it('reprend les limites telles quelles', () => {
        const byKey = Object.fromEntries(rendered.limits.map((limit) => [limit.key, limit]))
        expect(byKey.apps?.value).toBe(plan.projectLimit)
        expect(byKey.members?.value).toBe(plan.memberLimit)
        expect(byKey.domains?.value).toBe(plan.customDomainLimit)
        for (const limit of rendered.limits) {
          expect(limit.display).toBe(fr(limit.value))
          expect(limit.sentence.startsWith(fr(limit.value))).toBe(true)
        }
      })

      it('ne met en avant que le plan marqué highlighted', () => {
        expect(rendered.highlighted).toBe(plan.highlighted === true)
      })
    })
  }

  it('utilise le séparateur de milliers français', () => {
    const paid = view.find((plan) => plan.priceFcfa >= 1000)
    expect(paid?.amount).toMatch(/^\d{1,3}(?:[   ]\d{3})+$/)
  })
})

describe('BILLING_TERMS', () => {
  it('reprend la période et la grâce de lib/plans.ts', () => {
    expect(BILLING_TERMS).toEqual({ periodDays: PERIOD_DAYS, graceDays: GRACE_PERIOD_DAYS })
  })
})
