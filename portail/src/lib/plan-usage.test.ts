import { describe, expect, it } from 'vitest'
import { formatLimit, formatUsageOf, usageLabel, usageLevel, usagePercent } from '@/lib/plan-usage'

describe('plan-usage', () => {
  it('calcule le pourcentage borné', () => {
    expect(usagePercent(0, 10)).toBe(0)
    expect(usagePercent(5, 10)).toBe(50)
    expect(usagePercent(12, 10)).toBe(100)
    expect(usagePercent(1, 0)).toBe(100)
  })

  it('détecte les seuils 80% et 100%', () => {
    expect(usageLevel(7, 10)).toBe('ok')
    expect(usageLevel(8, 10)).toBe('warning')
    expect(usageLevel(10, 10)).toBe('full')
    expect(usageLevel(11, 10)).toBe('full')
  })

  it('fournit un libellé', () => {
    expect(usageLabel('warning')).toBe('Proche de la limite')
    expect(usageLabel('full')).toBe('Quota atteint')
  })
})


describe('formatLimit', () => {
  it('affiche « illimité » plutôt que « Infinity »', () => {
    expect(formatLimit(Number.POSITIVE_INFINITY)).toBe('illimité')
    expect(formatUsageOf(1, Number.POSITIVE_INFINITY)).toBe('1 / illimité')
  })

  it('formate une limite finie à la française', () => {
    expect(formatLimit(5)).toBe('5')
    expect(formatUsageOf(1200, 5000).replace(/\s/g, ' ')).toBe('1 200 / 5 000')
  })
})
