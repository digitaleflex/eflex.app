import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Test d'intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
// Le fournisseur d'e-mails est simulé : le code est lu dans le message « envoyé », jamais en base
// (il y est stocké haché).
const sent: { to: string; subject: string; text: string }[] = []
vi.mock('@/lib/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email')>()),
  isEmailConfigured: () => true,
  sendEmail: async (input: { to: string; subject: string; text: string }) => {
    sent.push(input)
  },
}))

const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

run('connexion par code e-mail (Better Auth emailOTP)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'

  const address = (name: string) => `${name}-${Date.now()}-${randomUUID().slice(0, 8)}@exemple.fr`
  const lastCode = (to: string) => {
    const mail = [...sent].reverse().find((m) => m.to === to)
    const code = mail?.subject.match(/^(\d{6}) /)?.[1]
    if (!code) throw new Error(`Aucun code envoyé à ${to}`)
    return code
  }

  beforeEach(() => {
    sent.length = 0
  })

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  async function request(email: string) {
    const { auth } = await import('@/lib/auth')
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
    return auth
  }

  it('crée le compte au premier code valide : e-mail vérifié, nom tiré de l’adresse, organisation personnelle', async () => {
    const email = address('ama.koffi')
    const auth = await request(email)
    const result = await auth.api.signInEmailOTP({ body: { email, otp: lastCode(email) } })

    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(result.user.id).toBe(user.id)
    expect(user.emailVerified).toBe(true)
    expect(user.name).toMatch(/^Ama koffi/)
    const members = await prisma.member.findMany({ where: { userId: user.id } })
    expect(members).toHaveLength(1)
    expect(members[0]!.role).toBe('owner')
  })

  it('stocke le code haché et refuse un mauvais code', async () => {
    const email = address('bob')
    const auth = await request(email)
    const code = lastCode(email)

    const { prisma } = await import('@/lib/prisma')
    const rows = await prisma.verification.findMany({ where: { identifier: { contains: email } } })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.value).not.toContain(code)

    const wrong = code === '000000' ? '111111' : '000000'
    await expect(auth.api.signInEmailOTP({ body: { email, otp: wrong } })).rejects.toThrow()
    // Le bon code fonctionne encore (un essai raté ne le consomme pas).
    await expect(auth.api.signInEmailOTP({ body: { email, otp: code } })).resolves.toBeTruthy()
  })

  it('refuse le code à un compte protégé par la double authentification', async () => {
    const email = address('carla')
    const auth = await request(email)
    await auth.api.signInEmailOTP({ body: { email, otp: lastCode(email) } })
    const { prisma } = await import('@/lib/prisma')
    await prisma.user.update({ where: { email }, data: { twoFactorEnabled: true } })

    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
    await expect(auth.api.signInEmailOTP({ body: { email, otp: lastCode(email) } })).rejects.toMatchObject({
      body: { code: 'TWO_FACTOR_REQUIRES_PASSWORD' },
    })
  })
})
