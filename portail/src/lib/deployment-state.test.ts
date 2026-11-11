import { describe, expect, it } from 'vitest'
import {
  DEPLOYMENT_STATUSES,
  aggregateDeploymentGroup,
  assertTransition,
  canTransition,
  isDeploymentStatus,
  isTerminal,
} from './deployment-state'

describe('machine à états des déploiements', () => {
  it('accepte la chaîne nominale complète', () => {
    const chain = ['queued', 'analyzing', 'provisioning', 'building', 'deploying', 'live']
    for (let i = 0; i < chain.length - 1; i += 1) {
      expect(canTransition(chain[i], chain[i + 1] as never)).toBe(true)
    }
  })

  it('accepte un échec à chaque étape non terminale', () => {
    for (const status of ['queued', 'analyzing', 'provisioning', 'building', 'deploying']) {
      expect(canTransition(status, 'failed')).toBe(true)
      expect(canTransition(status, 'cancelled')).toBe(true)
    }
  })

  it('refuse les sauts et les retours en arrière', () => {
    expect(canTransition('queued', 'live')).toBe(false)
    expect(canTransition('building', 'analyzing')).toBe(false)
    expect(canTransition('live', 'building')).toBe(false)
    expect(canTransition('failed', 'live')).toBe(false)
  })

  it('refuse un état inconnu', () => {
    expect(isDeploymentStatus('pending')).toBe(false)
    expect(canTransition('pending', 'analyzing')).toBe(false)
  })

  it('identifie les états terminaux', () => {
    for (const s of ['live', 'failed', 'cancelled']) expect(isTerminal(s)).toBe(true)
    for (const s of ['queued', 'building', 'deploying', 'inconnu']) expect(isTerminal(s)).toBe(false)
  })

  it('assertTransition lève une erreur sur une transition interdite', () => {
    expect(() => assertTransition('queued', 'analyzing')).not.toThrow()
    expect(() => assertTransition('queued', 'live')).toThrow(/interdite/)
  })

  it('tous les états ont un libellé français', () => {
    expect(DEPLOYMENT_STATUSES.every((s) => Boolean(s))).toBe(true)
  })
})

describe('agrégation d’un lot de déploiements', () => {
  it('n’est pas terminé tant qu’un déploiement n’est pas terminal', () => {
    const result = aggregateDeploymentGroup(['live', 'building', 'failed'])
    expect(result).toEqual({
      complete: false,
      total: 3,
      live: 1,
      failed: 1,
      cancelled: 0,
      active: 1,
      outcome: 'in-progress',
    })
  })

  it('considère un statut inconnu comme non terminal', () => {
    expect(aggregateDeploymentGroup(['live', 'pending']).complete).toBe(false)
  })

  it('reconnaît un lot entièrement en ligne', () => {
    expect(aggregateDeploymentGroup(['live', 'live']).outcome).toBe('all-live')
  })

  it('reconnaît un lot entièrement en échec', () => {
    expect(aggregateDeploymentGroup(['failed', 'failed']).outcome).toBe('all-failed')
  })

  it('reconnaît un lot entièrement annulé', () => {
    expect(aggregateDeploymentGroup(['cancelled']).outcome).toBe('all-cancelled')
  })

  it('reconnaît un lot mixte quand tous sont terminaux', () => {
    const result = aggregateDeploymentGroup(['live', 'failed', 'cancelled'])
    expect(result.complete).toBe(true)
    expect(result.outcome).toBe('mixed')
  })

  it('un lot vide n’est pas considéré comme terminé', () => {
    expect(aggregateDeploymentGroup([]).complete).toBe(false)
  })
})
