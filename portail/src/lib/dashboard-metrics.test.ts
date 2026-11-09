import { describe, expect, it } from 'vitest'
import { attentionItems, dailySeries, successRate, summarize, windowStart, type ProjectLite, type StatusCount } from '@/lib/dashboard-metrics'
import { attentionRank, statusInfo } from '@/lib/project-status'

const now = new Date('2026-11-08T12:00:00Z')
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000)
const dep = (status: string, daysAgo = 0, id = `${status}${daysAgo}`) => ({ id, status, createdAt: at(daysAgo) })
/** Ligne d'agrégation SQL : `count` déploiements de ce statut ce jour-là. */
const row = (status: string, daysAgo: number, count = 1): StatusCount => ({ day: at(daysAgo).toISOString().slice(0, 10), status, count })

describe('statusInfo', () => {
  it('décrit chaque statut et reste lisible pour un statut inconnu', () => {
    expect(statusInfo('live')).toMatchObject({ label: 'En ligne', tone: 'success', inProgress: false })
    expect(statusInfo('building')).toMatchObject({ tone: 'warning', inProgress: true })
    expect(statusInfo('failed').tone).toBe('danger')
    expect(statusInfo(null).label).toBe('Jamais déployé')
    expect(statusInfo('bizarre')).toMatchObject({ label: 'bizarre', tone: 'neutral' })
  })
  it('trie les échecs avant les builds, avant le reste', () => {
    expect(['live', 'building', 'failed', 'pending'].sort((a, b) => attentionRank(a) - attentionRank(b))).toEqual(['failed', 'building', 'pending', 'live'])
  })
})

describe('dailySeries', () => {
  it('additionne les comptes par jour sur la fenêtre, jours vides inclus, du plus ancien au plus récent', () => {
    const s = dailySeries([row('live', 0, 2), row('failed', 0), row('building', 1), row('live', 3), row('live', 40)], 5, now)
    expect(s).toHaveLength(5)
    expect(s.map((d) => d.day)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(s[4]).toMatchObject({ live: 2, failed: 1, other: 0 })
    expect(s[3]).toMatchObject({ live: 0, failed: 0, other: 1 })
    expect(s[1]).toMatchObject({ live: 1 }) // il y a 3 jours
    expect(s.reduce((n, d) => n + d.live + d.failed + d.other, 0)).toBe(5) // le jour d'il y a 40 jours est ignoré
  })

  it('compte les statuts du worker (queued, analyzing…) comme « en cours »', () => {
    const s = dailySeries([row('queued', 0), row('analyzing', 0, 2), row('cancelled', 0)], 3, now)
    expect(s[2]).toMatchObject({ live: 0, failed: 0, other: 4 })
  })
})

describe('windowStart', () => {
  it('commence à minuit UTC, `days` jours civils avant la fin (jour courant inclus)', () => {
    expect(windowStart(14, now).toISOString()).toBe('2026-10-26T00:00:00.000Z')
    expect(windowStart(1, now).toISOString()).toBe('2026-11-08T00:00:00.000Z')
  })
})

describe('successRate', () => {
  it('ne compte que les déploiements qui ont une issue', () => {
    expect(successRate([{ status: 'live', count: 2 }, { status: 'failed', count: 1 }, { status: 'building', count: 5 }])).toBe(67)
    expect(successRate([{ status: 'building', count: 3 }])).toBeNull()
    expect(successRate([])).toBeNull()
  })
})

describe('attentionItems', () => {
  const project = (id: string, ...deployments: ReturnType<typeof dep>[]): ProjectLite => ({ id, name: id, framework: 'node', domain: null, deployments })
  it('signale le dernier déploiement en échec ou en cours, jamais un échec déjà corrigé', () => {
    const items = attentionItems([
      project('ok', dep('live', 0)),
      project('corrigé', dep('live', 0), dep('failed', 2)),
      project('cassé', dep('failed', 1), dep('live', 5)),
      project('en-cours', dep('building', 0)),
      project('vide'),
    ])
    expect(items.map((i) => [i.name, i.kind])).toEqual([['cassé', 'failed'], ['en-cours', 'in-progress']])
  })
  it('résume le parc', () => {
    expect(summarize([project('a', dep('live')), project('b', dep('failed')), project('c')])).toEqual({ total: 3, live: 1, needsAttention: 1 })
  })
})
