import { describe, expect, it } from 'vitest'
import {
  formatStatusDate,
  observedAge,
  sampleCountLabel,
  uptimePercentLabel,
} from '@/lib/status-view'

describe('formatStatusDate', () => {
  it('affiche une date française explicite en UTC', () => {
    const formatted = formatStatusDate('2026-11-11T14:03:00.000Z')
    expect(formatted).toContain('2026')
    expect(formatted).toContain('UTC')
    expect(formatted).not.toContain('T14:03')
  })

  it('reste lisible quand l’horodatage est invalide', () => {
    expect(formatStatusDate('pas-une-date')).toBe('heure inconnue')
  })
})

describe('observedAge', () => {
  const now = Date.parse('2026-11-11T12:00:00.000Z')

  it('arrondit vers le bas et passe aux minutes puis aux heures', () => {
    expect(observedAge('2026-11-11T11:59:30.000Z', now)).toBe('il y a moins d’une minute')
    expect(observedAge('2026-11-11T11:59:00.000Z', now)).toBe('il y a 1 minute')
    expect(observedAge('2026-11-11T11:57:30.000Z', now)).toBe('il y a 2 minutes')
    expect(observedAge('2026-11-11T10:00:00.000Z', now)).toBe('il y a 2 heures')
    expect(observedAge('2026-11-09T12:00:00.000Z', now)).toBe('il y a 2 jours')
  })

  it('ne produit jamais une ancienneté négative (horloge en avance)', () => {
    expect(observedAge('2026-11-11T12:00:30.000Z', now)).toBe('il y a moins d’une minute')
  })

  it('signale un horodatage invalide', () => {
    expect(observedAge('inconnu', now)).toBe('heure inconnue')
  })
})

describe('uptimePercentLabel', () => {
  it('utilise la virgule française et une seule décimale', () => {
    expect(uptimePercentLabel(99.94)).toBe('99,9 %')
    expect(uptimePercentLabel(33.3)).toBe('33,3 %')
    expect(uptimePercentLabel(100)).toBe('100 %')
  })

  it('n’invente pas de chiffre sans relevé', () => {
    expect(uptimePercentLabel(null)).toBe('—')
  })
})

describe('sampleCountLabel', () => {
  it('accorde le nombre de relevés', () => {
    expect(sampleCountLabel(0)).toBe('aucun relevé exploitable')
    expect(sampleCountLabel(1)).toBe('1 relevé')
    expect(sampleCountLabel(2500)).toBe('2\u202f500 relevés')
  })
})
