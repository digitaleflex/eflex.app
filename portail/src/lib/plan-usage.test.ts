import { describe, expect, it } from 'vitest'
import { planUsage } from '@/lib/plan-usage'

describe('planUsage', () => {
  it('calcule la part consommée et le libellé', () => {
    expect(planUsage(3, 10)).toMatchObject({ percent: 30, tone: 'ok', label: '3 / 10 applications' })
  })

  it('prévient à partir de 80 %', () => {
    expect(planUsage(7, 10).tone).toBe('ok')
    expect(planUsage(8, 10).tone).toBe('warning')
    expect(planUsage(9, 10).tone).toBe('warning')
  })

  it('signale un quota atteint ou dépassé sans faire déborder la barre', () => {
    expect(planUsage(10, 10)).toMatchObject({ percent: 100, tone: 'full' })
    expect(planUsage(14, 10)).toMatchObject({ percent: 100, tone: 'full' })
  })

  it('reste défini pour des valeurs limites', () => {
    expect(planUsage(0, 0)).toMatchObject({ percent: 0, tone: 'ok' })
    expect(planUsage(2, 0)).toMatchObject({ percent: 100, tone: 'full' })
    expect(planUsage(-4, 5).used).toBe(0)
    expect(planUsage(Number.NaN, 5).used).toBe(0)
  })

  it('accorde « application » au singulier', () => {
    expect(planUsage(0, 1).label).toBe('0 / 1 application')
  })
})
