import { afterAll, describe, expect, it } from 'vitest'

// Test d'intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
// Lancé avec : EFLEX_TEST_DB=1 DATABASE_URL=… BETTER_AUTH_SECRET=… npx vitest run portail/src/lib/organizations.test.ts
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

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

  it("n'accorde le rôle administrateur qu'à une adresse de ADMIN_EMAILS dont l'e-mail est vérifié", async () => {
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    const bossEmail = `boss-${Date.now()}@exemple.fr`
    process.env.ADMIN_EMAILS = `${process.env.ADMIN_EMAILS ?? ''},${bossEmail}`

    // 1. Inscription avec l'adresse d'un administrateur, sans la posséder : aucun privilège, même après connexion.
    const res = await auth.api.signUpEmail({ body: { name: 'Usurpateur', email: bossEmail, password: 'motdepasse-solide' } })
    await auth.api.signInEmail({ body: { email: bossEmail, password: 'motdepasse-solide' } })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: res.user.id } })).role).not.toBe('admin')

    // 2. Dès que l'adresse est vérifiée (lien reçu, ou connexion Google), la prochaine connexion accorde le rôle.
    await prisma.user.update({ where: { id: res.user.id }, data: { emailVerified: true } })
    await auth.api.signInEmail({ body: { email: bossEmail, password: 'motdepasse-solide' } })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: res.user.id } })).role).toBe('admin')

    // 3. Une adresse hors liste, même vérifiée, reste utilisateur.
    const other = await signUp('Eve', email('eve'))
    await prisma.user.update({ where: { id: other.userId }, data: { emailVerified: true } })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).role).not.toBe('admin')
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

run('cycle de vie des organisations (API Better Auth)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'

  const mail = (n: string) => `${n}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@exemple.fr`
  const PASSWORD = 'motdepasse-solide'

  /** Crée un compte et renvoie les en-têtes d'une session ouverte. */
  async function account(name: string) {
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    const email = mail(name)
    const res = await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } })
    const login = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true })
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    return { auth, prisma, email, userId: res.user.id, headers: new Headers({ cookie }) }
  }

  it('invitation → acceptation → rôle membre, sans droit de créer des projets', async () => {
    const { canManageProjects, resolveOrganization } = await import('@/lib/organizations')
    const owner = await account('Owner')
    const guest = await account('Guest')
    const ownerMember = await owner.prisma.member.findFirstOrThrow({ where: { userId: owner.userId } })

    const invitation = await owner.auth.api.createInvitation({
      headers: owner.headers,
      body: { email: guest.email, role: 'member', organizationId: ownerMember.organizationId },
    })
    await guest.auth.api.acceptInvitation({ headers: guest.headers, body: { invitationId: invitation.id } })

    const member = await owner.prisma.member.findFirstOrThrow({ where: { userId: guest.userId, organizationId: ownerMember.organizationId } })
    expect(member.role).toBe('member')

    const resolved = await resolveOrganization({ user: { id: guest.userId }, session: { activeOrganizationId: ownerMember.organizationId } })
    expect(resolved).toEqual({ organizationId: ownerMember.organizationId, role: 'member' })
    expect(canManageProjects(resolved!.role)).toBe(false)
  })

  it("refuse une invitation acceptée par une autre adresse que celle invitée", async () => {
    const owner = await account('Owner2')
    const invited = await account('Invited')
    const intruder = await account('Intruder')
    const org = await owner.prisma.member.findFirstOrThrow({ where: { userId: owner.userId } })
    const invitation = await owner.auth.api.createInvitation({
      headers: owner.headers,
      body: { email: invited.email, role: 'member', organizationId: org.organizationId },
    })
    await expect(intruder.auth.api.acceptInvitation({ headers: intruder.headers, body: { invitationId: invitation.id } })).rejects.toThrow()
    expect(await owner.prisma.member.count({ where: { userId: intruder.userId, organizationId: org.organizationId } })).toBe(0)
  })

  it("un simple membre ne peut ni inviter ni retirer quelqu'un", async () => {
    const owner = await account('Owner3')
    const guest = await account('Guest3')
    const other = await account('Other3')
    const org = await owner.prisma.member.findFirstOrThrow({ where: { userId: owner.userId } })
    const inv = await owner.auth.api.createInvitation({ headers: owner.headers, body: { email: guest.email, role: 'member', organizationId: org.organizationId } })
    await guest.auth.api.acceptInvitation({ headers: guest.headers, body: { invitationId: inv.id } })

    await expect(
      guest.auth.api.createInvitation({ headers: guest.headers, body: { email: other.email, role: 'member', organizationId: org.organizationId } }),
    ).rejects.toThrow()
    await expect(
      guest.auth.api.removeMember({ headers: guest.headers, body: { memberIdOrEmail: owner.email, organizationId: org.organizationId } }),
    ).rejects.toThrow()
  })

  it("retire l'accès dès qu'un membre est retiré", async () => {
    const { resolveOrganization } = await import('@/lib/organizations')
    const owner = await account('Owner4')
    const guest = await account('Guest4')
    const org = await owner.prisma.member.findFirstOrThrow({ where: { userId: owner.userId } })
    const inv = await owner.auth.api.createInvitation({ headers: owner.headers, body: { email: guest.email, role: 'member', organizationId: org.organizationId } })
    await guest.auth.api.acceptInvitation({ headers: guest.headers, body: { invitationId: inv.id } })

    await owner.auth.api.removeMember({ headers: owner.headers, body: { memberIdOrEmail: guest.email, organizationId: org.organizationId } })

    const resolved = await resolveOrganization({ user: { id: guest.userId }, session: { activeOrganizationId: org.organizationId } })
    expect(resolved?.organizationId).not.toBe(org.organizationId)
  })

  it("le dernier propriétaire ne peut pas quitter l'organisation", async () => {
    const owner = await account('Owner5')
    const org = await owner.prisma.member.findFirstOrThrow({ where: { userId: owner.userId } })
    await expect(owner.auth.api.leaveOrganization({ headers: owner.headers, body: { organizationId: org.organizationId } })).rejects.toThrow()
  })

  it("refuse de supprimer une organisation qui contient encore des projets", async () => {
    const owner = await account('Owner6')
    const org = await owner.prisma.member.findFirstOrThrow({ where: { userId: owner.userId } })
    const created = await owner.auth.api.createOrganization({ headers: owner.headers, body: { name: 'Équipe', slug: `equipe-${Date.now()}` } })
    await owner.prisma.project.create({
      data: { organizationId: created.id, userId: owner.userId, name: 'P', slug: `p-${Date.now()}`, repoUrl: 'https://github.com/a/b', framework: 'node' },
    })
    await expect(owner.auth.api.deleteOrganization({ headers: owner.headers, body: { organizationId: created.id } })).rejects.toThrow(/projet/)
    expect(await owner.prisma.organization.count({ where: { id: created.id } })).toBe(1)
    expect(org.organizationId).not.toBe(created.id)
  })
})
