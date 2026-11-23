import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  open: null as { id: string; cause: string | null; details: string | null } | null,
  created: [] as unknown[],
  updated: [] as unknown[],
  monitorUpdates: [] as unknown[],
  notified: [] as unknown[],
  published: [] as unknown[],
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectSiteIncident: {
      findFirst: async () => db.open,
      create: async (arg: { data: Record<string, unknown> }) => {
        db.created.push(arg)
        return { id: 'inc-1', ...arg.data }
      },
      update: async (arg: { data: Record<string, unknown> }) => {
        db.updated.push(arg)
        return { id: 'inc-1', ...arg.data }
      },
    },
    projectSiteMonitor: {
      update: async (arg: unknown) => {
        db.monitorUpdates.push(arg)
      },
    },
  },
}))
vi.mock('@/lib/tls', () => ({ checkTls: async () => ({ ok: true }) }))
vi.mock('@/lib/notifications', () => ({
  memberIds: async () => ['u1'],
  notify: async (...args: unknown[]) => {
    db.notified.push(args)
  },
}))
vi.mock('@/lib/event-bus', () => ({
  publish: async (...args: unknown[]) => {
    db.published.push(args)
  },
}))

import { evaluateMonitor, FAILURE_THRESHOLD, RECOVERY_THRESHOLD, type ProbeResult } from './site-monitoring'

const monitor = (failures: number, successes: number) => ({
  id: 'm1',
  projectId: 'p1',
  organizationId: 'o1',
  host: 'exemple.fr',
  consecutiveFailures: failures,
  consecutiveSuccesses: successes,
  project: { id: 'p1', name: 'Boutique', organizationId: 'o1' },
})

const down: ProbeResult = { status: 'down', httpStatus: 503, latencyMs: 20, dnsOk: true, tlsOk: true, tlsExpiresAt: null, error: 'HTTP 503', cause: 'http' }
const up: ProbeResult = { status: 'up', httpStatus: 200, latencyMs: 20, dnsOk: true, tlsOk: true, tlsExpiresAt: null, error: null, cause: null }
const now = new Date('2026-11-23T10:00:00Z')

beforeEach(() => {
  db.open = null
  db.created.length = 0
  db.updated.length = 0
  db.monitorUpdates.length = 0
  db.notified.length = 0
  db.published.length = 0
})

describe('surveillance continue : incidents (#177)', () => {
  it('un échec isolé n’ouvre aucun incident ni notification', async () => {
    await evaluateMonitor(monitor(0, 5), down, now)
    expect(FAILURE_THRESHOLD).toBeGreaterThan(1)
    expect(db.created).toHaveLength(0)
    expect(db.notified).toHaveLength(0)
    expect(db.monitorUpdates[0]).toMatchObject({ data: { consecutiveFailures: 1, consecutiveSuccesses: 0 } })
  })

  it('l’échec confirmé ouvre un seul incident et notifie une fois, rattaché au projet', async () => {
    await evaluateMonitor(monitor(FAILURE_THRESHOLD - 1, 0), down, now)
    expect(db.created).toHaveLength(1)
    expect(db.created[0]).toMatchObject({ data: { projectId: 'p1', organizationId: 'o1', host: 'exemple.fr', status: 'open', cause: 'http', openedAt: now } })
    expect(db.notified).toHaveLength(1)
  })

  it('un incident déjà ouvert n’est pas rouvert et ne renotifie pas (pas de tempête)', async () => {
    db.open = { id: 'inc-1', cause: 'http', details: 'HTTP 503' }
    await evaluateMonitor(monitor(10, 0), down, now)
    expect(db.created).toHaveLength(0)
    expect(db.notified).toHaveLength(0)
    expect(db.updated[0]).toMatchObject({ data: { summary: expect.stringContaining('persistante') } })
  })

  it('le rétablissement exige des succès consécutifs, puis résout et notifie une fois', async () => {
    db.open = { id: 'inc-1', cause: 'http', details: null }
    await evaluateMonitor(monitor(0, 0), up, now)
    expect(RECOVERY_THRESHOLD).toBeGreaterThan(1)
    expect(db.updated).toHaveLength(0)

    await evaluateMonitor(monitor(0, RECOVERY_THRESHOLD - 1), up, now)
    // Une seule résolution ; l'autre mise à jour est l'horodatage de notification.
    const resolutions = db.updated.filter((u) => (u as { data: { status?: string } }).data.status === 'resolved')
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0]).toMatchObject({ data: { status: 'resolved', resolvedAt: now } })
    expect(db.notified).toHaveLength(1)
  })

  it('un site sain sans incident ne notifie jamais', async () => {
    await evaluateMonitor(monitor(0, 3), up, now)
    expect(db.notified).toHaveLength(0)
    expect(db.created).toHaveLength(0)
  })
})
