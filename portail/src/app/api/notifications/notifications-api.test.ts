import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : base PostgreSQL migrée requise (DATABASE_URL).
const run = process.env.DATABASE_URL ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

run('API notifications', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  const stamp = `${Date.now()}`
  let a: string, b: string
  const as = (id: string | null) => (currentSession = id ? { user: { id }, session: { id: 's' } } : null)
  const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)
  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  beforeAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    a = (await prisma.user.create({ data: { name: 'A', email: `a-${stamp}@exemple.fr` } })).id
    b = (await prisma.user.create({ data: { name: 'B', email: `b-${stamp}@exemple.fr` } })).id
    for (let i = 1; i <= 25; i++) {
      await prisma.notification.create({ data: { userId: a, type: 'deployment.succeeded', title: `A${i}`, createdAt: new Date(Date.now() - (30 - i) * 1000) } })
    }
    await prisma.notification.create({ data: { userId: b, type: 'deployment.failed', title: 'Secret de B' } })
  })
  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('401 sans session sur toutes les routes', async () => {
    as(null)
    const list = await import('./route'), read = await import('./read/route'), prefs = await import('./preferences/route')
    expect((await list.GET(req('/x'))).status).toBe(401)
    expect((await read.POST(req('/x', json({ all: true })))).status).toBe(401)
    expect((await prefs.GET()).status).toBe(401)
    expect((await prefs.PUT(req('/x', json({ type: 'deployment.failed', enabled: false })))).status).toBe(401)
  })

  it('liste seulement les notifications de l’utilisateur, du plus récent au plus ancien, avec pagination', async () => {
    const { GET } = await import('./route')
    as(a)
    const first = await (await GET(req('/api/notifications?limit=20'))).json()
    expect(first.notifications).toHaveLength(20)
    expect(first.notifications[0].title).toBe('A25')
    expect(first.unreadCount).toBe(25)
    expect(first.nextCursor).toBeTruthy()
    const second = await (await GET(req(`/api/notifications?limit=20&before=${first.nextCursor}`))).json()
    expect(second.notifications.map((n: { title: string }) => n.title)).toEqual(['A5', 'A4', 'A3', 'A2', 'A1'])
    expect(second.nextCursor).toBeNull()
    expect(JSON.stringify([first, second])).not.toContain('Secret de B')
  })

  it('un utilisateur ne peut pas marquer comme lue la notification d’un autre', async () => {
    const { prisma } = await import('@/lib/prisma')
    const { POST } = await import('./read/route')
    const target = await prisma.notification.findFirstOrThrow({ where: { userId: b } })
    as(a)
    const res = await (await POST(req('/x', json({ ids: [target.id] })))).json()
    expect(res.updated).toBe(0)
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: target.id } })).readAt).toBeNull()
  })

  it('marque une notification, puis toutes, comme lues', async () => {
    const { prisma } = await import('@/lib/prisma')
    const { POST } = await import('./read/route')
    as(a)
    const one = await prisma.notification.findFirstOrThrow({ where: { userId: a, title: 'A1' } })
    expect((await (await POST(req('/x', json({ ids: [one.id] })))).json()).unreadCount).toBe(24)
    expect((await (await POST(req('/x', json({ all: true })))).json()).unreadCount).toBe(0)
    expect(await prisma.notification.count({ where: { userId: b, readAt: null } })).toBe(1) // B est intact
    expect((await POST(req('/x', json({ nope: 1 })))).status).toBe(400)
  })

  it('préférences : tout est activé par défaut, un choix se mémorise, un type inconnu est refusé', async () => {
    const prefs = await import('./preferences/route')
    as(a)
    const before = (await (await prefs.GET()).json()).preferences as { type: string; enabled: boolean }[]
    expect(before.length).toBeGreaterThanOrEqual(5)
    expect(before.every((p) => p.enabled)).toBe(true)
    expect((await prefs.PUT(req('/x', json({ type: 'deployment.failed', enabled: false })))).status).toBe(200)
    const after = (await (await prefs.GET()).json()).preferences as { type: string; enabled: boolean }[]
    expect(after.find((p) => p.type === 'deployment.failed')!.enabled).toBe(false)
    expect(after.filter((p) => !p.enabled)).toHaveLength(1)
    // les préférences de A n'affectent pas B
    as(b)
    expect((await (await prefs.GET()).json()).preferences.every((p: { enabled: boolean }) => p.enabled)).toBe(true)
    as(a)
    expect((await prefs.PUT(req('/x', json({ type: 'inconnu', enabled: false })))).status).toBe(400)
  })
})
