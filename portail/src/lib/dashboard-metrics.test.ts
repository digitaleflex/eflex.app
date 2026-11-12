import { describe, expect, it } from 'vitest'
import { attentionItems, dailySeries, successRate, summarize, type ProjectLite } from '@/lib/dashboard-metrics'
import { attentionRank, statusInfo } from '@/lib/project-status'

const now = new Date('2026-11-08T12:00:00Z')
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000)
const dep = (status: string, daysAgo = 0, id = `${status}${daysAgo}`) => ({ id, status, createdAt: at(daysAgo) })

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
  it('compte par jour sur la fenêtre, jours vides inclus, du plus ancien au plus récent', () => {
    const s = dailySeries([dep('live', 0), dep('live', 0), dep('failed', 0), dep('building', 1), dep('live', 3), dep('live', 40)], 5, now)
    expect(s).toHaveLength(5)
    expect(s.map((d) => d.day)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(s[4]).toMatchObject({ live: 2, failed: 1, other: 0 })
    expect(s[3]).toMatchObject({ live: 0, failed: 0, other: 1 })
    expect(s[1]).toMatchObject({ live: 1 }) // il y a 3 jours
    expect(s.reduce((n, d) => n + d.live + d.failed + d.other, 0)).toBe(5) // le déploiement d'il y a 40 jours est ignoré
  })
})

describe('successRate', () => {
  it('ne compte que les déploiements qui ont une issue', () => {
    expect(successRate([{ status: 'live' }, { status: 'live' }, { status: 'failed' }, { status: 'building' }])).toBe(67)
    expect(successRate([{ status: 'building' }])).toBeNull()
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
    ], { now })
    expect(items.map((i) => [i.kind === 'failed' || i.kind === 'in-progress' ? i.name : i.kind, i.kind])).toEqual([['cassé', 'failed'], ['en-cours', 'in-progress']])
  })

  it('ajoute une alerte certificat quand il expire sous 14 jours', () => {
    const p: ProjectLite = { id: 's', name: 'Site', framework: null, domain: 's.test', deployments: [dep('live', 0)], tlsExpiresAt: new Date(now.getTime() + 5 * 86_400_000) }
    const items = attentionItems([p], { now })
    expect(items.some((i) => i.kind === 'certificate' && i.projectId === 's')).toBe(true)
  })

  it('ajoute une alerte de quota à partir de 80 %', () => {
    const items = attentionItems([project('a', dep('live', 0))], { now, quota: { used: 8, limit: 10 } })
    expect(items.some((i) => i.kind === 'quota')).toBe(true)
    const none = attentionItems([project('a', dep('live', 0))], { now, quota: { used: 7, limit: 10 } })
    expect(none.some((i) => i.kind === 'quota')).toBe(false)
  })

  it('résume le parc', () => {
    expect(summarize([project('a', dep('live')), project('b', dep('failed')), project('c')], { now })).toEqual({ total: 3, live: 1, needsAttention: 1 })
  })
})
