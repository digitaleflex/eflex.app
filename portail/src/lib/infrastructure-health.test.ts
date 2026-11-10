import { describe, expect, it } from 'vitest'
import {
  CERT_CRITICAL_DAYS,
  CERT_WARNING_DAYS,
  certificateRisk,
  classifySourceError,
  clampPercent,
  connectionLevel,
  countStaleDeployments,
  extractServerMetrics,
  formatBytes,
  formatLatency,
  normalizeQueueCounts,
  orphanApplications,
  overallHealth,
  percentLevel,
  queueLevel,
  sanitizeErrorText,
  summarizeCertificates,
  summarizeDeployments,
  worstLevel,
} from '@/lib/infrastructure-health'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-10T12:00:00.000Z')

describe('worstLevel / overallHealth', () => {
  it('retient le pire état', () => {
    expect(worstLevel(['ok', 'warning', 'ok'])).toBe('warning')
    expect(worstLevel(['warning', 'danger'])).toBe('danger')
    expect(worstLevel(['unknown', 'ok'])).toBe('unknown')
    expect(worstLevel([])).toBe('unknown')
  })

  it('l’état global est celui de la pire source', () => {
    expect(overallHealth(['ok', 'ok'])).toBe('ok')
    expect(overallHealth(['ok', 'danger'])).toBe('danger')
  })
})

describe('certificateRisk : seuils d’expiration', () => {
  it('signale une date inconnue', () => {
    expect(certificateRisk(null, NOW)).toMatchObject({ level: 'unknown', daysLeft: null })
    expect(certificateRisk('pas une date', NOW).level).toBe('unknown')
  })

  it('classe un certificat expiré en critique', () => {
    const risk = certificateRisk(new Date(NOW - 3 * DAY), NOW)
    expect(risk.level).toBe('danger')
    expect(risk.daysLeft).toBe(-3)
    expect(risk.label).toContain('Expiré depuis 3 jours')
  })

  it('classe l’expiration du jour et les 7 jours en critique', () => {
    expect(certificateRisk(new Date(NOW), NOW).level).toBe('danger')
    expect(certificateRisk(new Date(NOW + 1 * DAY), NOW).level).toBe('danger')
    expect(certificateRisk(new Date(NOW + CERT_CRITICAL_DAYS * DAY), NOW).level).toBe('danger')
  })

  it('classe 8 à 30 jours en avertissement, au-delà en normal', () => {
    expect(certificateRisk(new Date(NOW + (CERT_CRITICAL_DAYS + 1) * DAY), NOW).level).toBe('warning')
    expect(certificateRisk(new Date(NOW + CERT_WARNING_DAYS * DAY), NOW).level).toBe('warning')
    expect(certificateRisk(new Date(NOW + (CERT_WARNING_DAYS + 1) * DAY), NOW).level).toBe('ok')
  })

  it('accepte une chaîne ISO', () => {
    expect(certificateRisk(new Date(NOW + 10 * DAY).toISOString(), NOW)).toMatchObject({
      level: 'warning',
      daysLeft: 10,
    })
  })
})

describe('summarizeCertificates', () => {
  it('compte expirés, critiques et avertissements, du plus urgent au moins urgent', () => {
    const summary = summarizeCertificates(
      [
        { id: 'a', hostname: 'ok.exemple.fr', kind: 'project', expiresAt: new Date(NOW + 90 * DAY) },
        { id: 'b', hostname: 'expire.exemple.fr', kind: 'domain', expiresAt: new Date(NOW - DAY) },
        { id: 'c', hostname: 'critique.exemple.fr', kind: 'project', expiresAt: new Date(NOW + 2 * DAY) },
        { id: 'd', hostname: 'bientot.exemple.fr', kind: 'domain', expiresAt: new Date(NOW + 15 * DAY) },
      ],
      NOW,
    )
    expect(summary.total).toBe(4)
    expect(summary.expired).toBe(1)
    expect(summary.critical).toBe(1)
    expect(summary.warning).toBe(1)
    expect(summary.level).toBe('danger')
    expect(summary.soon.map((item) => item.id)).toEqual(['b', 'c', 'd'])
  })

  it('reste inconnu sans certificat suivi', () => {
    expect(summarizeCertificates([], NOW)).toMatchObject({ level: 'unknown', total: 0, soon: [] })
  })

  it('borne la liste renvoyée', () => {
    const entries = Array.from({ length: 20 }, (_, index) => ({
      id: `c${index}`,
      hostname: `c${index}.exemple.fr`,
      kind: 'project' as const,
      expiresAt: new Date(NOW + (index + 1) * DAY),
    }))
    expect(summarizeCertificates(entries, NOW, 5).soon).toHaveLength(5)
  })
})

describe('connexions PostgreSQL', () => {
  it('applique les seuils 70 % / 90 %', () => {
    expect(connectionLevel(null, 100)).toBe('unknown')
    expect(connectionLevel(10, null)).toBe('unknown')
    expect(connectionLevel(10, 0)).toBe('unknown')
    expect(connectionLevel(10, 100)).toBe('ok')
    expect(connectionLevel(70, 100)).toBe('warning')
    expect(connectionLevel(95, 100)).toBe('danger')
  })
})

describe('file de déploiements', () => {
  it('normalise des compteurs partiels ou invalides', () => {
    expect(normalizeQueueCounts({ waiting: 3, active: '2', failed: -1 })).toEqual({
      waiting: 3,
      active: 2,
      delayed: 0,
      failed: 0,
      completed: 0,
      paused: 0,
    })
    expect(normalizeQueueCounts(null)).toMatchObject({ waiting: 0, active: 0 })
  })

  it('passe en avertissement puis en critique quand la file s’accumule', () => {
    const base = normalizeQueueCounts({})
    expect(queueLevel(base)).toBe('ok')
    expect(queueLevel({ ...base, waiting: 10 })).toBe('warning')
    expect(queueLevel({ ...base, waiting: 50 })).toBe('danger')
  })

  it('regroupe les statuts de déploiement', () => {
    const summary = summarizeDeployments({ queued: 2, building: 1, live: 10, failed: 1, cancelled: 3 })
    expect(summary.total).toBe(17)
    expect(summary.active).toBe(3)
    expect(summary.queued).toBe(2)
    expect(summary.live).toBe(10)
    expect(summary.failed).toBe(1)
  })

  it('compte les déploiements bloqués au-delà du délai', () => {
    const rows = [
      { status: 'building', createdAt: new Date(NOW - 31 * 60_000) },
      { status: 'building', createdAt: new Date(NOW - 5 * 60_000) },
      { status: 'live', createdAt: new Date(NOW - 90 * 60_000) },
      { status: 'failed', createdAt: new Date(NOW - 90 * 60_000) },
    ]
    expect(countStaleDeployments(rows, NOW, 30 * 60_000)).toBe(1)
  })
})

describe('métriques serveur', () => {
  it('reste vide quand Coolify n’expose pas les métriques', () => {
    expect(extractServerMetrics({ uuid: 's1', name: 'vps', settings: {} })).toEqual({
      cpu: null,
      memory: null,
      disk: null,
    })
    expect(extractServerMetrics(null)).toEqual({ cpu: null, memory: null, disk: null })
  })

  it('lit les pourcentages directs et les objets { used, total }', () => {
    expect(
      extractServerMetrics({
        cpu_usage: 42,
        metrics: { memory: { used: 1_500, total: 2_000 }, disk: { percentage: 91 } },
      }),
    ).toEqual({ cpu: 42, memory: 75, disk: 91 })
  })

  it('borne les valeurs et applique les seuils 80 % / 95 %', () => {
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(-4)).toBeNull()
    expect(percentLevel(null)).toBe('unknown')
    expect(percentLevel(79.9)).toBe('ok')
    expect(percentLevel(80)).toBe('warning')
    expect(percentLevel(95)).toBe('danger')
  })
})

describe('applications orphelines', () => {
  const apps = [
    { id: 'a1', name: 'Liée' },
    { id: 'a2', name: 'Orpheline' },
    { id: '', name: 'Sans identifiant' },
  ]

  it('ne garde que les applications inconnues de la base', () => {
    expect(orphanApplications(apps, ['a1']).map((app) => app.id)).toEqual(['a2'])
    expect(orphanApplications(apps, [])).toHaveLength(2)
  })
})

describe('mapping des erreurs de source', () => {
  it('reconnaît les catégories attendues', () => {
    expect(classifySourceError('Service de déploiement non configuré.').kind).toBe('unconfigured')
    expect(classifySourceError('FetchError: The operation was aborted due to timeout').kind).toBe('timeout')
    expect(classifySourceError('Hébergement API 401 : Unauthenticated.').kind).toBe('unauthorized')
    expect(classifySourceError('Service de déploiement injoignable : fetch failed').kind).toBe('unreachable')
    expect(classifySourceError('Hébergement API 500 : Server Error').kind).toBe('http')
    expect(classifySourceError('quelque chose de bizarre').kind).toBe('unknown')
  })

  it('expurge jetons et identifiants d’URL', () => {
    const detail = sanitizeErrorText(
      'Authorization: Bearer sk_live_abcdef et erreur sur postgres://user:motdepasse@db:5432/eflex?token=xyz',
    )
    expect(detail).not.toContain('sk_live')
    expect(detail).not.toContain('motdepasse')
    expect(detail).not.toContain('xyz')
    expect(sanitizeErrorText('x'.repeat(1_000)).length).toBe(300)
  })
})

describe('formatage', () => {
  it('formate les tailles et les latences', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(0)).toBe('0 o')
    expect(formatBytes(1536)).toBe('1,5 ko')
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 Go')
    expect(formatLatency(null)).toBe('—')
    expect(formatLatency(42)).toBe('42 ms')
    expect(formatLatency(1_250)).toBe('1,3 s')
  })
})
