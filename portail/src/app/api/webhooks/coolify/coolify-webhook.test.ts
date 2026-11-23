import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  deliveries: new Set<string>(),
  audits: [] as unknown[],
  published: [] as unknown[],
  allowed: true,
}))

vi.mock('@/lib/rate-limit', () => ({ allowIp: async () => state.allowed }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    webhookDelivery: {
      create: async ({ data }: { data: { id: string } }) => {
        if (state.deliveries.has(data.id)) throw new Error('unique')
        state.deliveries.add(data.id)
      },
    },
  },
}))
vi.mock('@/lib/audit', () => ({
  audit: async (entry: unknown) => {
    state.audits.push(entry)
  },
  redact: (value: unknown) => value,
}))
vi.mock('@/lib/event-bus', () => ({
  publish: async (event: unknown) => {
    state.published.push(event)
  },
}))

import { POST } from './route'

const SECRET = 'secret-de-test-assez-long'
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest('https://eflex.test/api/webhooks/coolify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  state.deliveries.clear()
  state.audits.length = 0
  state.published.length = 0
  state.allowed = true
  process.env.COOLIFY_WEBHOOK_INBOUND_SECRET = SECRET
})

describe('POST /api/webhooks/coolify (#186)', () => {
  it('répond 503 tant que le secret n’est pas configuré', async () => {
    delete process.env.COOLIFY_WEBHOOK_INBOUND_SECRET
    expect((await call({}, { authorization: `Bearer ${SECRET}` })).status).toBe(503)
    expect(state.audits).toHaveLength(0)
  })

  it('refuse un secret absent ou erroné sans rien enregistrer', async () => {
    expect((await call({ event: 'x' })).status).toBe(401)
    expect((await call({ event: 'x' }, { authorization: 'Bearer mauvais' })).status).toBe(401)
    expect((await call({ event: 'x' }, { 'x-webhook-secret': `${SECRET}x` })).status).toBe(401)
    expect(state.audits).toHaveLength(0)
    expect(state.published).toHaveLength(0)
    expect(state.deliveries.size).toBe(0)
  })

  it('applique la limite de débit', async () => {
    state.allowed = false
    expect((await call({}, { authorization: `Bearer ${SECRET}` })).status).toBe(429)
  })

  it('accepte un secret valide, journalise et publie pour les administrateurs seulement', async () => {
    const res = await call(
      { event: 'deployment.failed', title: 'Échec', message: 'Build échoué', application_uuid: 'app-1' },
      { authorization: `Bearer ${SECRET}` },
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(state.audits[0]).toMatchObject({ action: 'platform.coolify.notification', target: { type: 'coolify', id: 'app-1' } })
    expect(state.published[0]).toMatchObject({ type: 'coolify.notification', audience: 'admin', payload: { event: 'deployment.failed', resource: 'app-1' } })
  })

  it('déduplique une livraison rejouée (même identifiant ou même contenu)', async () => {
    const headers = { 'x-coolify-delivery': 'abc', authorization: `Bearer ${SECRET}` }
    expect(await (await call({ event: 'a' }, headers)).json()).toEqual({ received: true })
    expect(await (await call({ event: 'a' }, headers)).json()).toEqual({ received: true, duplicate: true })

    const noId = { authorization: `Bearer ${SECRET}` }
    await call({ event: 'b' }, noId)
    expect(await (await call({ event: 'b' }, noId)).json()).toEqual({ received: true, duplicate: true })
    expect(state.audits).toHaveLength(2)
  })

  it('tolère un corps non JSON sans erreur', async () => {
    const req = new NextRequest('https://eflex.test/api/webhooks/coolify', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: 'pas du json',
    })
    expect((await POST(req)).status).toBe(200)
  })
})
