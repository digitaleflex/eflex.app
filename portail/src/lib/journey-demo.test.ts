import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LAST_STEP, nextStep, resultVisible, stepStatus, STEP_IDS } from './journey-demo'

describe('démonstration Code → EFLEX → Production (#218)', () => {
  it('a quatre étapes distinctes dans l’ordre du parcours', () => {
    expect(STEP_IDS).toEqual(['analyse', 'build', 'orchestration', 'production'])
    expect(LAST_STEP).toBe(3)
  })

  it('une seule étape est « en cours » à la fois, les précédentes sont terminées', () => {
    for (let active = 0; active <= LAST_STEP; active += 1) {
      const statuses = STEP_IDS.map((_, index) => stepStatus(index, active))
      expect(statuses.filter((s) => s === 'current')).toHaveLength(1)
      expect(statuses.slice(0, active).every((s) => s === 'done')).toBe(true)
      expect(statuses.slice(active + 1).every((s) => s === 'waiting')).toBe(true)
    }
  })

  it('l’application n’apparaît « en ligne » qu’à la dernière étape, quand l’orchestration est terminée', () => {
    for (let active = 0; active < LAST_STEP; active += 1) expect(resultVisible(active)).toBe(false)
    expect(resultVisible(LAST_STEP)).toBe(true)
    expect(stepStatus(2, LAST_STEP)).toBe('done') // jamais « build en cours » et « en production » ensemble
  })

  it('la séquence avance puis s’arrête, sans boucler', () => {
    expect(nextStep(0)).toBe(1)
    expect(nextStep(2)).toBe(3)
    expect(nextStep(LAST_STEP)).toBeNull()
  })
})

describe('garde-fous de contenu de la démonstration', () => {
  const source = readFileSync(new URL('../components/marketing/journey-demo.tsx', import.meta.url), 'utf8')

  it('déclare clairement que les données sont illustratives', () => {
    expect(source).toContain('Démonstration illustrative')
    expect(source).toContain('Données et état illustratifs')
  })

  it('ne promet ni garantie ni compatibilité universelle, et distingue plan et exécution', () => {
    expect(source).toContain('ne garantit pas la réussite du déploiement')
    expect(source).toContain('n’est pas une certification')
    expect(source).toContain('C’est un plan')
    expect(source).not.toMatch(/garanti[es]?\b(?! la réussite)|100 ?%|tous les (langages|frameworks)/i)
  })

  it('n’affiche aucune sauvegarde, supervision ni restauration', () => {
    expect(source).not.toMatch(/sauvegarde|supervision|restaur/i)
  })
})
