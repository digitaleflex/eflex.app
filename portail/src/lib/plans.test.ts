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
    // Les projets sont illimités sur tous les plans ; les limites membres et domaines augmentent.
    expect(PLANS.free.projectLimit).toBe(Number.POSITIVE_INFINITY)
    expect(PLANS.starter.projectLimit).toBe(Number.POSITIVE_INFINITY)
    expect(PLANS.pro.projectLimit).toBe(Number.POSITIVE_INFINITY)
    expect(PLANS.agency.projectLimit).toBe(Number.POSITIVE_INFINITY)
    expect(PLANS.free.memberLimit).toBeLessThan(PLANS.starter.memberLimit)
    expect(PLANS.starter.memberLimit).toBeLessThan(PLANS.pro.memberLimit)
    expect(PLANS.pro.memberLimit).toBeLessThan(PLANS.agency.memberLimit)
    expect(PLANS.free.customDomainLimit).toBeLessThan(PLANS.starter.customDomainLimit)
    expect(PLANS.starter.customDomainLimit).toBeLessThan(PLANS.pro.customDomainLimit)
    expect(PLANS.pro.customDomainLimit).toBeLessThan(PLANS.agency.customDomainLimit)
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
