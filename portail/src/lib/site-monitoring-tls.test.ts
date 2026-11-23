import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ notified: [] as Array<{ type: string; dedupeKey: string }> }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectSiteIncident: { findFirst: async () => null },
    projectSiteMonitor: { update: async () => undefined },
  },
}))
vi.mock('@/lib/tls', () => ({ checkTls: async () => ({ ok: true }) }))
vi.mock('@/lib/notifications', () => ({
  memberIds: async () => ['u1'],
  notify: async (entry: { type: string; dedupeKey: string }) => {
    db.notified.push(entry)
  },
}))
vi.mock('@/lib/event-bus', () => ({ publish: async () => undefined }))

import { evaluateMonitor, tlsExpiryThreshold, type ProbeResult } from './site-monitoring'

const day = 86_400_000
const now = new Date('2026-11-23T10:00:00Z')
const up: ProbeResult = { status: 'up', httpStatus: 200, latencyMs: 20, dnsOk: true, tlsOk: true, tlsExpiresAt: null, error: null, cause: null }
const monitor = {
  id: 'm1',
  projectId: 'p1',
  organizationId: 'o1',
  host: 'exemple.fr',
  consecutiveFailures: 0,
  consecutiveSuccesses: 3,
  project: { id: 'p1', name: 'Boutique', organizationId: 'o1' },
}

beforeEach(() => {
  db.notified.length = 0
})

describe('certificat proche de l’expiration (#177)', () => {
  it('retient le plus petit seuil franchi (14, 7, 3, 1)', () => {
    const at = (days: number) => new Date(now.getTime() + days * day)
    expect(tlsExpiryThreshold(at(30), now)).toBeNull()
    expect(tlsExpiryThreshold(at(14), now)).toBe(14)
    expect(tlsExpiryThreshold(at(10), now)).toBe(14)
    expect(tlsExpiryThreshold(at(6), now)).toBe(7)
    expect(tlsExpiryThreshold(at(2.5), now)).toBe(3)
    expect(tlsExpiryThreshold(at(0.5), now)).toBe(1)
  })

  it('ne dit rien d’un certificat inconnu ou déjà expiré (c’est un incident, pas une anticipation)', () => {
    expect(tlsExpiryThreshold(null, now)).toBeNull()
    expect(tlsExpiryThreshold(new Date(now.getTime() - day), now)).toBeNull()
  })

  it('notifie avec une clé de déduplication par certificat et par seuil', async () => {
    const expires = new Date(now.getTime() + 5 * day)
    await evaluateMonitor(monitor, { ...up, tlsExpiresAt: expires }, now)
    expect(db.notified).toEqual([
      expect.objectContaining({ type: 'site_monitor.tls_expiring', dedupeKey: `site-tls-expiry:m1:${expires.toISOString().slice(0, 10)}:7` }),
    ])
  })

  it('une expiration lointaine ne notifie pas', async () => {
    await evaluateMonitor(monitor, { ...up, tlsExpiresAt: new Date(now.getTime() + 90 * day) }, now)
    expect(db.notified).toHaveLength(0)
  })
})
