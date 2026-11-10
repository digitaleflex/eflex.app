import { describe, expect, it } from 'vitest'
import { PLANS, formatPrice, isActiveSubscription, isPlanId, planById } from './plans'

describe('plans', () => {
  it('retombe sur le plan gratuit pour une valeur inconnue', () => {
    expect(planById('enterprise').id).toBe('free')
    expect(planById(null).id).toBe('free')
    expect(isPlanId('pro')).toBe(true)
    expect(isPlanId('enterprise')).toBe(false)
  })

  it('seuls active et trialing donnent les limites payantes', () => {
    expect(isActiveSubscription('active')).toBe(true)
    expect(isActiveSubscription('trialing')).toBe(true)
    expect(isActiveSubscription('pending')).toBe(false)
    expect(isActiveSubscription('past_due')).toBe(false)
    expect(isActiveSubscription(null)).toBe(false)
  })

  it('les limites augmentent avec les plans', () => {
    expect(PLANS.free.projectLimit).toBeLessThan(PLANS.starter.projectLimit)
    expect(PLANS.starter.projectLimit).toBeLessThan(PLANS.pro.projectLimit)
    expect(PLANS.pro.projectLimit).toBeLessThan(PLANS.agency.projectLimit)
    expect(PLANS.free.customDomainLimit).toBeGreaterThan(0)
  })

  it('formate les prix en FCFA', () => {
    expect(formatPrice(0)).toBe('Gratuit')
    expect(formatPrice(12_000)).toContain('12')
    expect(formatPrice(12_000)).toContain('FCFA')
    expect(formatPrice(29_000)).toContain('29')
    expect(PLANS.starter.priceFcfa).toBe(12_000)
    expect(PLANS.pro.priceFcfa).toBe(29_000)
    expect(PLANS.agency.priceFcfa).toBe(59_000)
  })
})
