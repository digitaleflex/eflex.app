import { describe, expect, it } from 'vitest'
import {
  appHourlyRate,
  applyMonthlyCap,
  billableHours,
  creditAlertThreshold,
  daysOfCreditLeft,
  isValidTopup,
  priceApp,
  priceBuilds,
  priceDatabase,
} from './usage-pricing'

const t = (iso: string) => new Date(iso)

describe('tarification à l’usage', () => {
  it('arrondit à l’heure supérieure et ne facture jamais le négatif', () => {
    expect(billableHours(t('2026-11-01T00:00:00Z'), t('2026-11-01T00:00:01Z'))).toBe(1)
    expect(billableHours(t('2026-11-01T00:00:00Z'), t('2026-11-01T02:00:00Z'))).toBe(2)
    expect(billableHours(t('2026-11-01T02:00:00Z'), t('2026-11-01T00:00:00Z'))).toBe(0)
  })

  it('tarife la mémoire réservée par tranches de 256 Mo au-delà de 512 Mo', () => {
    expect(appHourlyRate(512)).toBe(2)
    expect(appHourlyRate(256)).toBe(2)
    expect(appHourlyRate(768)).toBe(3)
    expect(appHourlyRate(1024)).toBe(4)
    expect(appHourlyRate(1025)).toBe(5)
    expect(appHourlyRate(Number.NaN)).toBe(2)
  })

  it('chiffre une application sur un mois de 30 jours à 512 Mo (≈ 1 440 FCFA)', () => {
    expect(priceApp(512, t('2026-11-01T00:00:00Z'), t('2026-12-01T00:00:00Z')).amountFcfa).toBe(1440)
  })

  it('chiffre une base et les builds au-delà de 30', () => {
    expect(priceDatabase(t('2026-11-01T00:00:00Z'), t('2026-11-01T10:00:00Z')).amountFcfa).toBe(30)
    expect(priceBuilds(30).amountFcfa).toBe(0)
    expect(priceBuilds(34)).toMatchObject({ quantity: 4, amountFcfa: 100 })
  })

  it('applique un plafond mensuel optionnel', () => {
    expect(applyMonthlyCap(5000, null)).toEqual({ totalFcfa: 5000, capped: false })
    expect(applyMonthlyCap(5000, 3000)).toEqual({ totalFcfa: 3000, capped: true })
    expect(applyMonthlyCap(2000, 3000)).toEqual({ totalFcfa: 2000, capped: false })
  })

  it('n’accepte que les montants de recharge prévus', () => {
    expect(isValidTopup(5000)).toBe(true)
    expect(isValidTopup(1234)).toBe(false)
  })

  it('alerte à 7, 3 puis 1 jour de crédit restant', () => {
    expect(daysOfCreditLeft(700, 0)).toBeNull()
    expect(daysOfCreditLeft(700, 700)).toBe(7)
    expect(creditAlertThreshold(null)).toBeNull()
    expect(creditAlertThreshold(30)).toBeNull()
    expect(creditAlertThreshold(7)).toBe(7)
    expect(creditAlertThreshold(3)).toBe(3)
    expect(creditAlertThreshold(0)).toBe(1)
  })
})
