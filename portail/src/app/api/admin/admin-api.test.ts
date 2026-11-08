import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : base PostgreSQL migrée requise (DATABASE_URL).
const run = process.env.DATABASE_URL ? describe : describe.skip

let currentSession: unknown = null
let currentHeaders = new Headers()
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))
vi.mock('next/headers', () => ({ headers: async () => currentHeaders }))

const here = new URL('.', import.meta.url).pathname
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? routeFiles(p) : name === 'route.ts' ? [p] : []
  })
}

run('API d’administration', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  const stamp = `${Date.now()}`
  const adminEmail = `admin-${stamp}@exemple.fr`
  process.env.ADMIN_EMAILS = adminEmail

  const PASSWORD = 'motdepasse-solide'
  type Acc = { id: string; email: string; headers: Headers; session: unknown }
  let admin: Acc
  let victim: Acc
  let regular: Acc

  async function account(name: string, email: string): Promise<Acc> {
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    const res = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } })
    const login = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true })
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.user.id } })
    return { id: user.id, email, headers: new Headers({ cookie }), session: { user, session: {} } }
  }
  const as = (a: Acc | null) => {
    currentSession = a?.session ?? null
    currentHeaders = a?.headers ?? new Headers()
  }
  const call = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  beforeAll(async () => {
    admin = await account('Admin', adminEmail)
    victim = await account('Victime', `victime-${stamp}@exemple.fr`)
    regular = await account('Simple', `simple-${stamp}@exemple.fr`)
  })
  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('contrat : toute route api/admin/** répond 404 à un non-administrateur', async () => {
    const files = routeFiles(here)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>
      const handlers = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => typeof mod[m] === 'function')
      expect(handlers.length, file).toBeGreaterThan(0)
      for (const who of [null, regular]) {
        as(who)
        for (const m of handlers) {
          const res = await (mod[m] as (r: Request, c: unknown) => Promise<Response>)(call('/x', { method: m, body: m === 'GET' ? undefined : '{}' }), ctx('inconnu'))
          expect(res.status, `${m} ${file} (${who ? 'utilisateur' : 'anonyme'})`).toBe(404)
        }
      }
    }
  })

  it('suspend un compte : motif obligatoire, sessions fermées, connexion refusée, audit écrit', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/ban/route')
    const { prisma } = await import('@/lib/prisma')
    const { auth } = await import('@/lib/auth')
    as(admin)

    const sansMotif = await POST(call('/x', { method: 'POST', body: JSON.stringify({ reason: '' }) }), ctx(victim.id))
    expect(sansMotif.status).toBe(400)

    const res = await POST(call('/x', { method: 'POST', body: JSON.stringify({ reason: 'Minage de cryptomonnaie' }) }), ctx(victim.id))
    expect(res.status).toBe(200)

    expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).banned).toBe(true)
    expect(await prisma.session.count({ where: { userId: victim.id } })).toBe(0)
    await expect(auth.api.signInEmail({ body: { email: victim.email, password: PASSWORD } })).rejects.toThrow()

    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.ban', targetId: victim.id } })
    expect(entry.actorId).toBe(admin.id)
    expect(JSON.stringify(entry.details)).toContain('Minage')
  })

  it('réactive un compte suspendu, avec audit', async () => {
    const { DELETE } = await import('@/app/api/admin/users/[id]/ban/route')
    const { prisma } = await import('@/lib/prisma')
    const { auth } = await import('@/lib/auth')
    as(admin)
    expect((await DELETE(call('/x', { method: 'DELETE' }), ctx(victim.id))).status).toBe(200)
    await expect(auth.api.signInEmail({ body: { email: victim.email, password: PASSWORD } })).resolves.toBeTruthy()
    expect(await prisma.auditLog.count({ where: { action: 'user.unban', targetId: victim.id } })).toBe(1)
  })

  it('refuse de se suspendre soi-même ou de suspendre un administrateur', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/ban/route')
    as(admin)
    const body = JSON.stringify({ reason: 'Test de protection' })
    expect((await POST(call('/x', { method: 'POST', body }), ctx(admin.id))).status).toBe(400)
    const { prisma } = await import('@/lib/prisma')
    const other = await prisma.user.create({ data: { name: 'Autre admin', email: `a2-${stamp}@exemple.fr`, role: 'admin' } })
    expect((await POST(call('/x', { method: 'POST', body }), ctx(other.id))).status).toBe(409)
  })

  it('un utilisateur suspendu perd aussi l’accès administrateur', async () => {
    const { isAdmin } = await import('@/lib/admin')
    expect(isAdmin({ user: { role: 'admin', banned: true } } as never)).toBe(false)
  })
})
