import { describe, expect, it } from 'vitest'
import { computeOverall, uptimePercent } from './status-model'

const component = (key: string, state: 'ok' | 'degraded' | 'down' | 'unknown') => ({ key, state })

describe('computeOverall', () => {
  it('est ok quand tout va bien, y compris les composants non surveillés', () => {
    expect(computeOverall([
      component('portal', 'ok'),
      component('database', 'ok'),
      component('redis', 'unknown'),
      component('coolify', 'unknown'),
    ])).toBe('ok')
  })

  it('dégrade le service si un composant périphérique tombe', () => {
    expect(computeOverall([
      component('portal', 'ok'),
      component('database', 'ok'),
      component('coolify', 'down'),
    ])).toBe('degraded')
  })

  it('considère une panne de la base comme une indisponibilité totale', () => {
    expect(computeOverall([
      component('portal', 'ok'),
      component('database', 'down'),
    ])).toBe('down')
  })

  it('considère une panne du portail comme une indisponibilité totale', () => {
    expect(computeOverall([component('portal', 'down'), component('database', 'ok')])).toBe('down')
  })

  it('traite un état dégradé comme une dégradation', () => {
    expect(computeOverall([component('portal', 'ok'), component('redis', 'degraded')])).toBe('degraded')
  })
})

describe('uptimePercent', () => {
  it('renvoie null sans échantillon', () => {
    expect(uptimePercent(0, 0)).toBeNull()
  })

  it('calcule un pourcentage arrondi à une décimale', () => {
    expect(uptimePercent(999, 1000)).toBe(99.9)
    expect(uptimePercent(1, 3)).toBe(33.3)
  })

  it('borne le résultat entre 0 et 100', () => {
    expect(uptimePercent(12, 10)).toBe(100)
    expect(uptimePercent(-1, 10)).toBe(0)
  })
})
