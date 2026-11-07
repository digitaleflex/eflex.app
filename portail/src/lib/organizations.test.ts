import { afterAll, describe, expect, it } from 'vitest'

// Test d'intégration : nécessite une base PostgreSQL migrée (DATABASE_URL).
// Lancé avec : DATABASE_URL=… BETTER_AUTH_SECRET=… npx vitest run src/lib/organizations.test.ts
const run = process.env.DATABASE_URL ? describe : describe.skip

run('multi-tenant (Better Auth organization + admin)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.ADMIN_EMAILS = 'boss@exemple.fr'

  const email = (n: string) => `${n}-${Date.now()}@exemple.fr`

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  async function signUp(name: string, mail: string) {
    const { auth } = await import('@/lib/auth')
    const res = await auth.api.signUpEmail({ body: { name, email: mail, password: 'motdepasse-solide' } })
    const { prisma } = await import('@/lib/prisma')
    return { auth, prisma, userId: res.user.id }
  }

  it("crée l'organisation personnelle à l'inscription, avec un propriétaire", async () => {
    const { prisma, userId } = await signUp('Ann', email('ann'))
    const members = await prisma.member.findMany({ where: { userId }, include: { organization: true } })
    expect(members).toHaveLength(1)
    expect(members[0]!.role).toBe('owner')
    expect(members[0]!.organization.slug).toBe(`u-${userId.toLowerCase()}`)
  })

  it("fixe l'organisation active de la session à la connexion", async () => {
    const mail = email('bob')
    const { auth, prisma, userId } = await signUp('Bob', mail)
    await auth.api.signInEmail({ body: { email: mail, password: 'motdepasse-solide' } })
    const session = await prisma.session.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
    const member = await prisma.member.findFirstOrThrow({ where: { userId } })
    expect(session?.activeOrganizationId).toBe(member.organizationId)
  })

  it("n'accorde le rôle administrateur qu'aux adresses de ADMIN_EMAILS", async () => {
    const { prisma, userId } = await signUp('Chef', 'boss@exemple.fr').catch(async () => {
      const { prisma } = await import('@/lib/prisma')
      const u = await prisma.user.findUniqueOrThrow({ where: { email: 'boss@exemple.fr' } })
      return { prisma, userId: u.id }
    })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe('admin')
    const other = await signUp('Eve', email('eve'))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).role).toBe('user')
  })

  it("resolveOrganization ne donne jamais l'organisation d'un autre locataire", async () => {
    const { resolveOrganization } = await import('@/lib/organizations')
    const a = await signUp('A', email('a'))
    const b = await signUp('B', email('b'))
    const orgB = await a.prisma.member.findFirstOrThrow({ where: { userId: b.userId } })
    // La session de A prétend agir sur l'organisation de B : repli sur la sienne.
    const resolved = await resolveOrganization({ user: { id: a.userId }, session: { activeOrganizationId: orgB.organizationId } })
    const orgA = await a.prisma.member.findFirstOrThrow({ where: { userId: a.userId } })
    expect(resolved?.organizationId).toBe(orgA.organizationId)
    expect(resolved?.organizationId).not.toBe(orgB.organizationId)
  })
})
