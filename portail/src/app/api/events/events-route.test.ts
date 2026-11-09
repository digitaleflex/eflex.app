import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

type Ev = { id: string; event: string; data: Record<string, unknown> }

run('GET /api/events : bus d’événements temps réel', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.EVENTS_RECHECK_MS = '200' // revérification rapide des droits pour le test

  const stamp = `${Date.now()}`
  type U = { id: string; orgId: string; sessionId: string; admin: boolean }
  let a: U, b: U, boss: U

  const sessionOf = (u: U) => ({ user: { id: u.id, role: u.admin ? 'admin' : 'user', banned: false }, session: { id: u.sessionId, activeOrganizationId: u.orgId } })

  async function makeUser(name: string, admin = false): Promise<U> {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.create({ data: { name, email: `${name}-${stamp}@exemple.fr`, role: admin ? 'admin' : 'user' } })
    const org = await prisma.organization.create({ data: { name, slug: `o-${name}-${stamp}`, members: { create: { userId: user.id, role: 'owner' } } } })
    const session = await prisma.session.create({ data: { token: `tok-${name}-${stamp}`, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } })
    return { id: user.id, orgId: org.id, sessionId: session.id, admin }
  }

  /** Ouvre le flux pour `u` et accumule les événements reçus. */
  async function connect(u: U, lastEventId?: string) {
    const { GET } = await import('./route')
    currentSession = sessionOf(u)
    const ctrl = new AbortController()
    const res = await GET(new Request('http://localhost/api/events', { signal: ctrl.signal, headers: lastEventId ? { 'last-event-id': lastEventId } : {} }))
    const events: Ev[] = []
    let closed = false
    if (res.status === 200) {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      void (async () => {
        for (;;) {
          const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
          if (done) break
          buffer += decoder.decode(value)
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop()!
          for (const block of blocks) {
            const get = (k: string) => block.split('\n').filter((l) => l.startsWith(`${k}:`)).map((l) => l.slice(k.length + 1).trim()).join('\n')
            if (get('event')) events.push({ id: get('id'), event: get('event'), data: JSON.parse(get('data') || 'null') })
          }
        }
        closed = true
      })()
    }
    return { res, events, isClosed: () => closed, close: () => ctrl.abort(), named: (type: string) => events.filter((e) => e.event === 'event' && e.data.type === type) }
  }
  const until = async (cond: () => boolean, ms = 4000) => {
    const end = Date.now() + ms
    while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 25))
    return cond()
  }

  beforeAll(async () => {
    a = await makeUser('alice')
    b = await makeUser('bob')
    boss = await makeUser('boss', true)
  })
  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('401 sans session', async () => {
    currentSession = null
    const { GET } = await import('./route')
    expect((await GET(new Request('http://localhost/api/events'))).status).toBe(401)
  })

  it('isole les organisations : aucun événement ne traverse, l’audience admin reste réservée', async () => {
    const { publish } = await import('@/lib/event-bus')
    const sa = await connect(a)
    const sb = await connect(b)
    const sboss = await connect(boss)
    await until(() => [sa, sb, sboss].every((s) => s.events.some((e) => e.event === 'ready')))

    await publish({ type: 'deployment.status', organizationId: a.orgId, payload: { projectId: 'p-a', status: 'live' } })
    await publish({ type: 'deployment.status', organizationId: b.orgId, payload: { projectId: 'p-b', status: 'failed' } })
    await publish({ type: 'audit.entry', audience: 'admin', payload: { action: 'user.ban' } })
    await publish({ type: 'notification.created', audience: 'user', userId: a.id, payload: { n: 1 } })

    await until(() => sa.named('deployment.status').length >= 1 && sb.named('deployment.status').length >= 1 && sboss.named('audit.entry').length >= 1 && sa.named('notification.created').length >= 1)
    await new Promise((r) => setTimeout(r, 300)) // laisse le temps à un éventuel événement fautif d'arriver

    expect(sa.named('deployment.status').map((e) => e.data.projectId)).toEqual(['p-a'])
    expect(sb.named('deployment.status').map((e) => e.data.projectId)).toEqual(['p-b'])
    expect(sa.named('audit.entry')).toHaveLength(0)
    expect(sb.named('audit.entry')).toHaveLength(0)
    expect(sboss.named('audit.entry')).toHaveLength(1)
    expect(sa.named('notification.created')).toHaveLength(1)
    expect(sb.named('notification.created')).toHaveLength(0)
    for (const s of [sa, sb, sboss]) s.close()
  })

  it('reprend après une coupure : rejoue ce qui manque, sans doublon', async () => {
    const { publish, latestEventId } = await import('@/lib/event-bus')
    const before = await latestEventId()
    for (const n of [1, 2, 3]) await publish({ type: 'project.updated', organizationId: a.orgId, payload: { n } })

    const resumed = await connect(a, String(before + 1)) // le client a déjà reçu le premier
    await until(() => resumed.named('project.updated').length >= 2)
    await new Promise((r) => setTimeout(r, 300))
    expect(resumed.named('project.updated').map((e) => e.data.n)).toEqual([2, 3])
    // et le temps réel continue après le rejeu
    await publish({ type: 'project.updated', organizationId: a.orgId, payload: { n: 4 } })
    await until(() => resumed.named('project.updated').length >= 3)
    expect(resumed.named('project.updated').map((e) => e.data.n)).toEqual([2, 3, 4])
    resumed.close()
  })

  it('un nouveau flux ne rejoue pas l’historique', async () => {
    const { publish } = await import('@/lib/event-bus')
    await publish({ type: 'project.created', organizationId: a.orgId, payload: { old: true } })
    const fresh = await connect(a)
    await until(() => fresh.events.some((e) => e.event === 'ready'))
    await new Promise((r) => setTimeout(r, 300))
    expect(fresh.named('project.created')).toHaveLength(0)
    fresh.close()
  })

  it('termine le flux quand le membre est retiré de l’organisation', async () => {
    const { prisma } = await import('@/lib/prisma')
    const guest = await makeUser('guest')
    await prisma.member.create({ data: { organizationId: a.orgId, userId: guest.id, role: 'member' } })
    const s = await connect({ ...guest, orgId: a.orgId })
    await until(() => s.events.some((e) => e.event === 'ready'))
    await prisma.member.deleteMany({ where: { userId: guest.id, organizationId: a.orgId } })
    expect(await until(() => s.events.some((e) => e.event === 'end' && e.data.reason === 'forbidden'))).toBe(true)
    expect(await until(() => s.isClosed())).toBe(true)
  })

  it('termine le flux quand la session est fermée (compte suspendu)', async () => {
    const { prisma } = await import('@/lib/prisma')
    const victim = await makeUser('victim')
    const s = await connect(victim)
    await until(() => s.events.some((e) => e.event === 'ready'))
    await prisma.session.delete({ where: { id: victim.sessionId } })
    expect(await until(() => s.events.some((e) => e.event === 'end' && e.data.reason === 'forbidden'))).toBe(true)
  })

  it('limite le nombre de flux ouverts par utilisateur (429)', async () => {
    const heavy = await makeUser('heavy')
    const streams = []
    for (let i = 0; i < 5; i++) streams.push(await connect(heavy))
    const sixth = await connect(heavy)
    expect(sixth.res.status).toBe(429)
    for (const s of streams) s.close()
  })
})
