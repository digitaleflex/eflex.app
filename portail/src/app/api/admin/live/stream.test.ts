import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

type Frame = { id: string; event: string; data: Record<string, unknown> }

run('GET /api/admin/live/stream : terminal d’exploitation', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  const stamp = `${Date.now()}`
  let adminId = ''
  let organizationId = ''

  beforeAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.create({
      data: { name: 'Exploitation', email: `live-${stamp}@exemple.fr`, role: 'admin' },
    })
    const organization = await prisma.organization.create({
      data: { name: `Supervision ${stamp}`, slug: `supervision-${stamp}`, members: { create: { userId: user.id, role: 'owner' } } },
    })
    adminId = user.id
    organizationId = organization.id
    currentSession = { user, session: { id: `session-${stamp}` } }
  })

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('diffuse un événement en moins de 2 s, sans secret', async () => {
    const { GET } = await import('./stream/route')
    const { publish } = await import('@/lib/event-bus')
    const controller = new AbortController()
    const response = await GET(new Request('http://localhost/api/admin/live/stream', { signal: controller.signal }))
    expect(response.status).toBe(200)

    const frames: Frame[] = []
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const reading = (async () => {
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const field = (name: string) =>
            block
              .split('\n')
              .filter((line) => line.startsWith(`${name}:`))
              .map((line) => line.slice(name.length + 1).trim())
              .join('\n')
          const event = field('event')
          if (!event) continue
          frames.push({ id: field('id'), event, data: JSON.parse(field('data') || 'null') as Record<string, unknown> })
        }
      }
    })()

    const until = async (condition: () => boolean, ms: number) => {
      const end = Date.now() + ms
      while (!condition() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 20))
      return condition()
    }

    // `ready` est envoyé après l'abonnement : aucun événement publié ensuite ne peut être perdu.
    expect(await until(() => frames.some((frame) => frame.event === 'ready'), 4_000)).toBe(true)

    const started = Date.now()
    await publish({
      type: 'deployment.status',
      organizationId,
      payload: { status: 'failed', name: 'Projet du flux', token: 'secret-sse', nested: { password: 'hunter2' } },
    })
    const received = () =>
      frames.find((frame) => frame.event === 'event' && frame.data.type === 'deployment.status' && frame.data.organizationId === organizationId)

    expect(await until(() => received() !== undefined, 2_000)).toBe(true)
    expect(Date.now() - started).toBeLessThan(2_000)

    const frame = received()!
    expect(frame.id).not.toBe('')
    expect(frame.data.organizationName).toBe(`Supervision ${stamp}`)
    expect((frame.data.payload as Record<string, unknown>).token).toBe('[masqué]')
    expect(JSON.stringify(frame)).not.toContain('secret-sse')
    expect(JSON.stringify(frame)).not.toContain('hunter2')

    controller.abort()
    await reading
  })

  it('404 pour un visiteur non administrateur', async () => {
    const { GET } = await import('./stream/route')
    currentSession = { user: { id: adminId, role: 'user', banned: false }, session: { id: 'x' } }
    const response = await GET(new Request('http://localhost/api/admin/live/stream'))
    expect(response.status).toBe(404)
  })
})
