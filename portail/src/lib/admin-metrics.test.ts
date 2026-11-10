import { describe, expect, it } from 'vitest'
import {
  adminMetricsCsv,
  buildAdminAlerts,
  csvCell,
  dailyDeploymentSeries,
  deploymentTotals,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatFcfa,
  formatInteger,
  formatPercent,
  medianDurationSeconds,
  parsePeriodDays,
  periodStart,
  quotaOverruns,
  revenueSummary,
  stackDeploymentStats,
  successRate,
  unpaidSummary,
  type AdminMetrics,
} from '@/lib/admin-metrics'

const now = new Date('2026-11-10T23:30:00Z')
const normalize = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ')

describe('parsePeriodDays', () => {
  it('accepte uniquement les périodes proposées', () => {
    expect(parsePeriodDays('7')).toBe(7)
    expect(parsePeriodDays('30')).toBe(30)
    expect(parsePeriodDays('90')).toBe(90)
    expect(parsePeriodDays(['7', '90'])).toBe(7)
  })
  it('retombe sur 30 jours pour une valeur absente ou invalide', () => {
    expect(parsePeriodDays(undefined)).toBe(30)
    expect(parsePeriodDays(null)).toBe(30)
    expect(parsePeriodDays('12')).toBe(30)
    expect(parsePeriodDays('abc')).toBe(30)
  })
})

describe('periodStart', () => {
  it('commence à minuit UTC, jour courant inclus', () => {
    expect(periodStart(7, now).toISOString()).toBe('2026-11-04T00:00:00.000Z')
    expect(periodStart(1, now).toISOString()).toBe('2026-11-10T00:00:00.000Z')
  })
  it('ne dépend ni de l’heure ni du fuseau du serveur', () => {
    expect(periodStart(7, new Date('2026-11-11T00:00:01Z')).toISOString()).toBe('2026-11-05T00:00:00.000Z')
  })
})

describe('dailyDeploymentSeries', () => {
  const rows = [
    { day: '2026-11-04', status: 'live', count: 1 },
    { day: '2026-11-10', status: 'live', count: 2 },
    { day: '2026-11-10', status: 'failed', count: 1 },
    { day: '2026-11-10', status: 'building', count: 3 },
    { day: '2026-10-01', status: 'live', count: 99 },
  ]

  it('produit une série continue, du plus ancien au plus récent', () => {
    const series = dailyDeploymentSeries(rows, 7, now)
    expect(series).toHaveLength(7)
    expect(series[0]!.day).toBe('2026-11-04')
    expect(series[6]!.day).toBe('2026-11-10')
    expect(series[0]).toMatchObject({ live: 1, failed: 0, other: 0 })
    expect(series[6]).toMatchObject({ live: 2, failed: 1, other: 3 })
    expect(series[3]).toMatchObject({ live: 0, failed: 0, other: 0 })
  })

  it('ignore les lignes hors fenêtre et les comptes invalides', () => {
    const series = dailyDeploymentSeries(
      [...rows, { day: '2026-11-09', status: 'live', count: Number.NaN }],
      7,
      now,
    )
    expect(series.reduce((total, bucket) => total + bucket.live + bucket.failed + bucket.other, 0)).toBe(7)
  })
})

describe('deploymentTotals', () => {
  it('additionne les statuts et le total', () => {
    expect(
      deploymentTotals([
        { day: '2026-11-09', live: 2, failed: 1, other: 0 },
        { day: '2026-11-10', live: 1, failed: 0, other: 4 },
      ]),
    ).toEqual({ live: 3, failed: 1, other: 4, total: 8 })
  })
})

describe('successRate', () => {
  it('ne compte que les déploiements terminés', () => {
    expect(successRate(2, 1)).toBe(67)
    expect(successRate(0, 0)).toBeNull()
    expect(successRate(0, 3)).toBe(0)
  })
})

describe('stackDeploymentStats', () => {
  it('agrège par stack et trie du plus actif au moins actif', () => {
    const stats = stackDeploymentStats([
      { framework: 'nextjs', status: 'live', count: 3 },
      { framework: 'nextjs', status: 'failed', count: 1 },
      { framework: 'laravel', status: 'live', count: 8 },
      { framework: 'laravel', status: 'building', count: 2 },
      { framework: '', status: 'failed', count: 1 },
    ])
    expect(stats.map((stat) => stat.framework)).toEqual(['laravel', 'nextjs', 'inconnu'])
    expect(stats[0]).toMatchObject({ live: 8, other: 2, total: 10, successRate: 100 })
    expect(stats[1]).toMatchObject({ live: 3, failed: 1, total: 4, successRate: 75 })
    expect(stats[2]!.successRate).toBe(0)
  })

  it('ne calcule pas de taux quand aucun déploiement n’est terminé', () => {
    expect(stackDeploymentStats([{ framework: 'node', status: 'deploying', count: 2 }])[0]!.successRate).toBeNull()
  })
})

describe('medianDurationSeconds', () => {
  it('calcule une médiane paire et impaire, en secondes', () => {
    expect(medianDurationSeconds([5_000, 1_000, 3_000])).toBe(3)
    expect(medianDurationSeconds([1_000, 3_000])).toBe(2)
    expect(medianDurationSeconds([0])).toBe(0)
  })
  it('ignore les valeurs négatives ou non finies et gère l’échantillon vide', () => {
    expect(medianDurationSeconds([-1_000, 2_000, Number.NaN, 4_000])).toBe(3)
    expect(medianDurationSeconds([])).toBeNull()
  })
})

describe('revenueSummary', () => {
  it('somme le MRR des abonnements actifs et normalise les valeurs absentes', () => {
    expect(revenueSummary(3, 41_000)).toEqual({ mrrFcfa: 41_000, activeSubscriptions: 3 })
    expect(revenueSummary(0, null)).toEqual({ mrrFcfa: 0, activeSubscriptions: 0 })
    expect(revenueSummary(-2, -500)).toEqual({ mrrFcfa: 0, activeSubscriptions: 0 })
  })
})

describe('unpaidSummary', () => {
  it('additionne paiements en attente et abonnements en retard sans valeurs négatives', () => {
    expect(
      unpaidSummary({
        pendingPayments: 2,
        pendingAmountFcfa: 24_000,
        pastDueSubscriptions: -1,
        pastDueAmountFcfa: null,
      }),
    ).toEqual({
      pendingPayments: 2,
      pendingAmountFcfa: 24_000,
      pastDueSubscriptions: 0,
      pastDueAmountFcfa: 0,
    })
  })
})

describe('quotaOverruns', () => {
  const organizations = [
    { id: 'pro', name: 'Pro trop chargée', subscription: { plan: 'pro', status: 'active' } },
    { id: 'free', name: 'Gratuite', subscription: null },
    { id: 'inactive', name: 'Abonnement inactif', subscription: { plan: 'agency', status: 'cancelled' } },
    { id: 'ok', name: 'Dans les clous', subscription: { plan: 'starter', status: 'active' } },
  ]

  it('applique le plan effectif et signale projets et membres au-delà de la limite', () => {
    const overruns = quotaOverruns(
      organizations,
      [
        { organizationId: 'pro', count: 31 },
        { organizationId: 'free', count: 6 },
        { organizationId: 'inactive', count: 8 },
        { organizationId: 'ok', count: 10 },
      ],
      [{ organizationId: 'ok', count: 11 }],
    )
    expect(overruns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: 'pro', kind: 'projects', limit: 30, plan: 'Pro' }),
        expect.objectContaining({ organizationId: 'free', kind: 'projects', limit: 5, plan: 'Découverte' }),
        expect.objectContaining({ organizationId: 'inactive', kind: 'projects', limit: 5, plan: 'Découverte' }),
        expect.objectContaining({ organizationId: 'ok', kind: 'members', used: 11, limit: 10 }),
      ]),
    )
    expect(overruns).toHaveLength(4)
  })

  it('ne signale rien à la limite exacte (le quota bloque la création suivante, sans dépassement)', () => {
    expect(
      quotaOverruns(
        [{ id: 'ok', name: 'OK', subscription: { plan: 'starter', status: 'active' } }],
        [{ organizationId: 'ok', count: 10 }],
        [{ organizationId: 'ok', count: 10 }],
      ),
    ).toEqual([])
  })
})

describe('buildAdminAlerts', () => {
  const base = {
    failedDeployments: 0,
    finishedDeployments: 0,
    stuckDeployments: 0,
    pendingPayments: 0,
    pendingAmountFcfa: 0,
    pastDueSubscriptions: 0,
    quotaOverruns: [],
  }

  it('ne produit aucune alerte quand tout va bien', () => {
    expect(buildAdminAlerts(base)).toEqual([])
  })

  it('classe le critique avant l’avertissement et décrit chaque alerte', () => {
    const alerts = buildAdminAlerts({
      ...base,
      stuckDeployments: 2,
      failedDeployments: 3,
      finishedDeployments: 10,
      pendingPayments: 1,
      pendingAmountFcfa: 12_000,
      pastDueSubscriptions: 1,
      quotaOverruns: [
        { organizationId: 'o', name: 'Org', kind: 'projects', used: 6, limit: 5, plan: 'Découverte' },
      ],
    })
    expect(alerts.map((alert) => alert.severity)).toEqual(['critical', 'critical', 'critical', 'warning', 'warning'])
    expect(alerts[0]!.id).toBe('stuck-deployments')
    expect(alerts[0]!.title).toContain('2 déploiements bloqués')
    expect(alerts.some((alert) => alert.id === 'failed-deployments' && alert.detail.includes('30 %'))).toBe(true)
    expect(alerts.some((alert) => alert.id === 'past-due-subscriptions')).toBe(true)
    expect(
      alerts.some((alert) => alert.id === 'pending-payments' && normalize(alert.detail).includes('12 000 FCFA')),
    ).toBe(true)
    expect(alerts.some((alert) => alert.id === 'quota-overruns' && alert.detail.includes('Org'))).toBe(true)
  })

  it('passe l’échec en critique seulement au-delà de 30 % sur au moins 5 déploiements terminés', () => {
    const abnormal = buildAdminAlerts({ ...base, failedDeployments: 4, finishedDeployments: 10 })
    expect(abnormal[0]!.severity).toBe('critical')
    const isolated = buildAdminAlerts({ ...base, failedDeployments: 1, finishedDeployments: 3 })
    expect(isolated[0]!.severity).toBe('warning')
  })
})

describe('formatage', () => {
  it('formate les nombres en français et les montants en FCFA', () => {
    expect(normalize(formatInteger(12_345))).toBe('12 345')
    expect(normalize(formatFcfa(29_000))).toBe('29 000 FCFA')
  })

  it('distingue l’absence de donnée d’un zéro', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(0)).toBe('0 %')
    expect(formatPercent(67.6)).toBe('68 %')
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(90)).toBe('1 min 30 s')
    expect(formatDuration(3_600)).toBe('1 h')
  })

  it('formate les jours en UTC et reste tolérant aux entrées invalides', () => {
    expect(formatDayShort('2026-11-10')).toContain('nov.')
    expect(formatDayLong('2026-11-10')).toContain('2026')
    expect(formatDayShort('pas-une-date')).toBe('pas-une-date')
  })
})

describe('export CSV', () => {
  it('échappe le séparateur, les guillemets et les retours à la ligne', () => {
    expect(csvCell('simple')).toBe('simple')
    expect(csvCell('Nom; avec séparateur')).toBe('"Nom; avec séparateur"')
    expect(csvCell('Il a dit "oui"')).toBe('"Il a dit ""oui"""')
    expect(csvCell('deux\nlignes')).toBe('"deux\nlignes"')
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('=1;2')).toBe('"\'=1;2"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(42)).toBe('42')
  })

  it('produit un rapport complet, lisible par un tableur', () => {
    const metrics: AdminMetrics = {
      days: 30,
      users: { total: 120, banned: 2, new7: 4, new30: 18, newInPeriod: 18 },
      organizations: { total: 40, activeInPeriod: 7 },
      projects: { total: 63 },
      deployments: {
        total: 10,
        live: 7,
        failed: 2,
        other: 1,
        successRate: 78,
        daily: [{ day: '2026-11-10', live: 7, failed: 2, other: 1 }],
        stacks: [{ framework: 'nextjs', live: 7, failed: 2, other: 1, total: 10, successRate: 78 }],
      },
      buildDuration: { medianSeconds: null, sampleCount: 0, available: false },
      revenue: { mrrFcfa: 41_000, activeSubscriptions: 3 },
      unpaid: {
        pendingPayments: 1,
        pendingAmountFcfa: 12_000,
        pastDueSubscriptions: 1,
        pastDueAmountFcfa: 29_000,
      },
      quotas: {
        checkedOrganizations: 2,
        overruns: [
          { organizationId: 'o', name: 'Client; Premium', kind: 'projects', used: 6, limit: 5, plan: 'Découverte' },
        ],
      },
      alerts: [
        {
          id: 'failed-deployments',
          severity: 'warning',
          title: '2 déploiements en échec',
          detail: 'Taux d’échec de 22 %.',
        },
      ],
    }

    const csv = adminMetricsCsv(metrics, new Date('2026-11-10T12:00:00Z'))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Rapport Eflex — métriques d’administration')
    expect(lines).toContain('Période;30 jours')
    expect(lines).toContain('Généré le;2026-11-10T12:00:00.000Z')
    expect(lines).toContain('Déploiements par jour')
    expect(lines).toContain('Jour;Réussis;Échecs;Autres;Total')
    expect(lines).toContain('2026-11-10;7;2;1;10')
    expect(lines).toContain('Stack;Réussis;Échecs;Autres;Total;Taux (%)')
    expect(lines).toContain('nextjs;7;2;1;10;78')
    expect(lines).toContain('"Client; Premium";projets;6;5;Découverte')
    expect(lines).toContain('Gravité;Titre;Détail')
    expect(lines).toContain('warning;2 déploiements en échec;Taux d’échec de 22 %.')
  })
})
