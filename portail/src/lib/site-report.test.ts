import { describe, expect, it } from 'vitest'
import { buildSiteReport, parseMonth } from './site-report'

const d = (iso: string) => new Date(iso)

describe('parseMonth', () => {
  it('lit AAAA-MM et borne le mois en UTC', () => {
    const p = parseMonth('2026-11')!
    expect(p.start.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })
  it('refuse les formats invalides', () => {
    for (const bad of ['2026-13', '2026-1', 'novembre', '1999-01', '2026-11-01']) expect(parseMonth(bad), bad).toBeNull()
  })
  it('prend le mois courant par défaut', () => {
    expect(parseMonth(null, d('2026-03-15T00:00:00Z'))!.month).toBe('2026-03')
  })
})

describe('buildSiteReport', () => {
  const period = parseMonth('2026-11')!
  const now = d('2026-12-05T00:00:00Z') // mois terminé : période complète = 30 jours

  it('compte les déploiements du mois seulement', () => {
    const r = buildSiteReport(
      {
        ...period,
        deployments: [
          { status: 'live', createdAt: d('2026-11-03T10:00:00Z') },
          { status: 'failed', createdAt: d('2026-11-20T10:00:00Z') },
          { status: 'live', createdAt: d('2026-10-30T10:00:00Z') },
        ],
        incidents: [],
        monitored: true,
        databases: [],
      },
      now,
    )
    expect(r.deployments).toMatchObject({ total: 2, live: 1, failed: 1, rollbacked: 0, lastAt: '2026-11-20T10:00:00.000Z' })
  })

  it('calcule la disponibilité estimée à partir des incidents, coupés aux bornes du mois', () => {
    const r = buildSiteReport(
      {
        ...period,
        deployments: [],
        incidents: [
          { openedAt: d('2026-11-10T00:00:00Z'), resolvedAt: d('2026-11-10T03:00:00Z'), cause: 'http' }, // 180 min
          { openedAt: d('2026-10-31T23:00:00Z'), resolvedAt: d('2026-11-01T01:00:00Z'), cause: 'dns' }, // 60 min dans le mois
          { openedAt: d('2026-12-10T00:00:00Z'), resolvedAt: null, cause: 'http' }, // hors mois
        ],
        monitored: true,
        databases: [],
      },
      now,
    )
    expect(r.availability.incidents).toBe(2)
    expect(r.availability.downtimeMinutes).toBe(240)
    expect(r.availability.byCause).toEqual({ http: 1, dns: 1 })
    // 240 min sur 43 200 min : 99,44 %
    expect(r.availability.percent).toBe(99.44)
  })

  it('ne donne aucun pourcentage sans sonde : rien n’est inventé', () => {
    const r = buildSiteReport({ ...period, deployments: [], incidents: [], monitored: false, databases: [] }, now)
    expect(r.availability).toMatchObject({ measured: false, percent: null })
    expect(r.notMeasured).toContain('Bande passante')
  })

  it('un incident encore ouvert court jusqu’à maintenant', () => {
    const live = d('2026-11-10T12:00:00Z')
    const r = buildSiteReport(
      { ...period, deployments: [], incidents: [{ openedAt: d('2026-11-10T10:00:00Z'), resolvedAt: null, cause: null }], monitored: true, databases: [] },
      live,
    )
    expect(r.availability.downtimeMinutes).toBe(120)
    expect(r.availability.byCause).toEqual({ inconnue: 1 })
  })

  it('expose l’état des sauvegardes sans chemins ni secrets', () => {
    const r = buildSiteReport(
      {
        ...period,
        deployments: [],
        incidents: [],
        monitored: true,
        databases: [{ kind: 'postgresql', backupScheduled: true, lastRestoreStatus: 'finished', lastRestoreFinishedAt: d('2026-11-12T00:00:00Z') }],
      },
      now,
    )
    expect(r.databases).toEqual([
      { kind: 'postgresql', backupScheduled: true, lastRestoreStatus: 'finished', lastRestoreFinishedAt: '2026-11-12T00:00:00.000Z' },
    ])
  })
})
