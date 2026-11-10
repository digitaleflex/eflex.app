import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

run('POST /api/projects/[id]/transfer', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.ENV_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64')

  const stamp = `${Date.now()}`
  let sequence = 0
  const next = () => ++sequence

  type Person = { id: string; email: string }
  type Org = { id: string; name: string }
  type Project = { id: string }

  let prisma: typeof import('@/lib/prisma').prisma

  let owner: Person
  let simpleMember: Person
  let targetOnlyMember: Person
  let outsider: Person
  let quotaOwner: Person
  let pager: Person

  let source: Org
  let target: Org
  let sourceForTargetMember: Org
  let targetWhereUserIsMember: Org
  let quotaSource: Org
  let quotaTarget: Org
  let pagingOrg: Org

  let successProject: Project
  let activeProject: Project
  let sameOrgProject: Project
  let quotaProject: Project
  let memberProject: Project
  let sourceBProject: Project

  const asUser = (user: Person | null, activeOrganizationId: string | null) => {
    currentSession = user
      ? { user: { id: user.id, email: user.email }, session: { activeOrganizationId } }
      : null
  }

  const makeUser = async (label: string): Promise<Person> =>
    prisma.user.create({ data: { name: label, email: `${label}-${stamp}@exemple.fr` } })

  const makeOrg = async (label: string): Promise<Org> =>
    prisma.organization.create({ data: { name: label, slug: `${label}-${stamp}` } })

  const addMember = async (organizationId: string, userId: string, role: string) =>
    prisma.member.create({ data: { organizationId, userId, role } })

  const makeProject = async (
    organizationId: string,
    userId: string,
    label: string,
  ): Promise<Project> =>
    prisma.project.create({
      data: {
        organizationId,
        userId,
        name: label,
        slug: `${label}-${stamp}-${next()}`,
        repoUrl: 'https://github.com/exemple/projet',
        framework: 'node',
      },
      select: { id: true },
    })

  const transfer = async (projectId: string, body: unknown) => {
    const { POST } = await import('./route')
    return POST(
      new Request(`http://localhost/api/projects/${projectId}/transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma

    ;[owner, simpleMember, targetOnlyMember, outsider, quotaOwner, pager] = await Promise.all([
      makeUser('owner'),
      makeUser('simple-member'),
      makeUser('target-member-only'),
      makeUser('outsider'),
      makeUser('quota-owner'),
      makeUser('pager'),
    ])

    ;[source, target, sourceForTargetMember, targetWhereUserIsMember, quotaSource, quotaTarget, pagingOrg] =
      await Promise.all([
        makeOrg('source'),
        makeOrg('target'),
        makeOrg('source-b'),
        makeOrg('target-b'),
        makeOrg('source-quota'),
        makeOrg('target-quota'),
        makeOrg('paging'),
      ])

    await Promise.all([
      addMember(source.id, owner.id, 'owner'),
      addMember(target.id, owner.id, 'admin'),
      addMember(source.id, simpleMember.id, 'member'),
      addMember(target.id, simpleMember.id, 'owner'),
      addMember(sourceForTargetMember.id, targetOnlyMember.id, 'owner'),
      addMember(targetWhereUserIsMember.id, targetOnlyMember.id, 'member'),
      addMember(quotaSource.id, quotaOwner.id, 'owner'),
      addMember(quotaTarget.id, quotaOwner.id, 'owner'),
      addMember(pagingOrg.id, pager.id, 'owner'),
      // Propriétaire de sa propre organisation et de la cible, mais pas de la source du projet :
      // le filtre d'organisation doit renvoyer 404, pas un transfert inter-locataires.
      addMember(target.id, pager.id, 'owner'),
    ])

    ;[successProject, activeProject, sameOrgProject, quotaProject, memberProject, sourceBProject] =
      await Promise.all([
        makeProject(source.id, owner.id, 'succes'),
        makeProject(source.id, owner.id, 'actif'),
        makeProject(source.id, owner.id, 'meme-organisation'),
        makeProject(quotaSource.id, quotaOwner.id, 'quota'),
        makeProject(source.id, owner.id, 'membre-simple'),
        makeProject(sourceForTargetMember.id, targetOnlyMember.id, 'source-b'),
      ])

    // Le transfert ne touche ni aux variables (chiffrées), ni aux domaines, ni à l'historique.
    const { encrypt } = await import('@/lib/crypto')
    await prisma.envVar.create({
      data: {
        projectId: successProject.id,
        key: 'DATABASE_URL',
        value: encrypt('postgres://u:mot-de-passe@h/db', `${successProject.id}:DATABASE_URL`),
      },
    })
    await prisma.projectDomain.create({
      data: { projectId: successProject.id, hostname: `transfert-${stamp}.exemple.fr` },
    })
    await prisma.deployment.create({
      data: { projectId: successProject.id, commitSha: 'a'.repeat(40), status: 'live' },
    })

    await prisma.deployment.create({
      data: { projectId: activeProject.id, commitSha: 'b'.repeat(40), status: 'building' },
    })

    // Organisation cible déjà pleine (plan gratuit : 5 projets).
    for (let index = 0; index < 5; index += 1) {
      await makeProject(quotaTarget.id, quotaOwner.id, `plein-${index}`)
    }
  })

  afterAll(async () => {
    const { prisma: client } = await import('@/lib/prisma')
    await client.$disconnect()
  })

  it('refuse une requête anonyme (401) et un utilisateur sans organisation (404)', async () => {
    asUser(null, null)
    expect((await transfer(successProject.id, { organizationId: target.id })).status).toBe(401)

    // Aucune appartenance : resolveOrganization est null, donc projet introuvable.
    asUser(outsider, null)
    expect((await transfer(successProject.id, { organizationId: target.id })).status).toBe(404)

    // Utilisateur d'une autre organisation : le projet de la source reste invisible.
    asUser(pager, pagingOrg.id)
    expect((await transfer(successProject.id, { organizationId: target.id })).status).toBe(404)
  })

  it('refuse un simple membre de l’organisation source (403)', async () => {
    asUser(simpleMember, source.id)
    const response = await transfer(memberProject.id, { organizationId: target.id })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain('organisation actuelle')
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: memberProject.id } })).organizationId,
    ).toBe(source.id)
  })

  it('refuse une organisation cible où l’utilisateur n’est que membre (403)', async () => {
    asUser(targetOnlyMember, sourceForTargetMember.id)
    const response = await transfer(sourceBProject.id, { organizationId: targetWhereUserIsMember.id })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain('propriétaire ou administrateur')
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: sourceBProject.id } })).organizationId,
    ).toBe(sourceForTargetMember.id)
  })

  it('refuse une organisation cible inconnue ou sans appartenance (403, sans fuite)', async () => {
    asUser(owner, source.id)
    const response = await transfer(successProject.id, { organizationId: 'org-inexistante' })
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('not_authorized')
  })

  it('refuse la même organisation (400) et un corps invalide (400)', async () => {
    asUser(owner, source.id)
    const same = await transfer(sameOrgProject.id, { organizationId: source.id })
    expect(same.status).toBe(400)
    expect((await same.json()).code).toBe('same_organization')

    const empty = await transfer(sameOrgProject.id, { organizationId: '   ' })
    expect(empty.status).toBe(400)
  })

  it('refuse le transfert pendant un déploiement actif (409) sans déplacer le projet', async () => {
    asUser(owner, source.id)
    const response = await transfer(activeProject.id, { organizationId: target.id })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('deployment_in_progress')
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: activeProject.id } })).organizationId,
    ).toBe(source.id)
  })

  it('refuse quand le quota de projets de la cible est atteint (403 plan_limit)', async () => {
    asUser(quotaOwner, quotaSource.id)
    const response = await transfer(quotaProject.id, { organizationId: quotaTarget.id })
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('plan_limit')
    expect(body.error).toContain('Découverte')
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: quotaProject.id } })).organizationId,
    ).toBe(quotaSource.id)
  })

  it('transfère pour un propriétaire de la source et administrateur de la cible', async () => {
    asUser(owner, source.id)
    const response = await transfer(successProject.id, { organizationId: target.id })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.project.id).toBe(successProject.id)
    expect(body.from).toMatchObject({ id: source.id })
    expect(body.to).toMatchObject({ id: target.id })

    const moved = await prisma.project.findUniqueOrThrow({
      where: { id: successProject.id },
      include: { envVars: true, domains: true, deployments: true },
    })
    expect(moved.organizationId).toBe(target.id)
    // Variables, domaines et déploiements suivent le projet sans être recréés.
    expect(moved.envVars.map((item) => item.key)).toEqual(['DATABASE_URL'])
    expect(moved.domains.map((item) => item.hostname)).toEqual([`transfert-${stamp}.exemple.fr`])
    expect(moved.deployments).toHaveLength(1)

    // La valeur chiffrée reste déchiffrable : l'AAD (projectId:clé) n'a pas changé.
    const { decrypt } = await import('@/lib/crypto')
    expect(decrypt(moved.envVars[0]!.value, `${successProject.id}:DATABASE_URL`)).toBe(
      'postgres://u:mot-de-passe@h/db',
    )
  })

  it('rend le projet visible à la nouvelle organisation et invisible à l’ancienne', async () => {
    const { GET } = await import('../route')

    asUser(owner, source.id)
    const denied = await GET(new Request('http://localhost/api/projects/x'), {
      params: Promise.resolve({ id: successProject.id }),
    })
    expect(denied.status).toBe(404)

    asUser(owner, target.id)
    const allowed = await GET(new Request('http://localhost/api/projects/x'), {
      params: Promise.resolve({ id: successProject.id }),
    })
    expect(allowed.status).toBe(200)
    const body = await allowed.json()
    expect(body.project.id).toBe(successProject.id)
    expect(body.project.envVars.map((item: { key: string }) => item.key)).toEqual(['DATABASE_URL'])
  })

  it('écrit une entrée d’audit avec la source et la cible', async () => {
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'project.transfer', targetId: successProject.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(entry).not.toBeNull()
    expect(entry!.actorId).toBe(owner.id)
    expect(entry!.organizationId).toBe(source.id)
    const details = entry!.details as Record<string, string>
    expect(details.fromOrganizationId).toBe(source.id)
    expect(details.toOrganizationId).toBe(target.id)
    expect(details.projectName).toBe('succes')
  })

  it('publie un événement de sortie pour la source et d’entrée pour la cible', async () => {
    const rows = await prisma.event.findMany({
      where: { type: 'project.transferred' },
      orderBy: { id: 'asc' },
    })
    const ours = rows.filter(
      (row) => (row.payload as Record<string, unknown>).projectId === successProject.id,
    )
    expect(ours).toHaveLength(2)
    expect(
      ours
        .map((row) => ({
          organizationId: row.organizationId,
          direction: (row.payload as Record<string, unknown>).direction,
        }))
        .sort((a, b) => String(a.direction).localeCompare(String(b.direction))),
    ).toEqual([
      { organizationId: target.id, direction: 'in' },
      { organizationId: source.id, direction: 'out' },
    ])
  })
})
