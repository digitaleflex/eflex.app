import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

run('GET /api/projects/[id]/deployments', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'

  const stamp = `${Date.now()}`
  let prisma: typeof import('@/lib/prisma').prisma

  let owner: { id: string; email: string }
  let member: { id: string; email: string }
  let outsider: { id: string; email: string }
  let orgId = ''
  let outsiderOrgId = ''
  let projectId = ''
  let otherProjectId = ''
  const expected: Array<{ id: string; status: string }> = []

  const asUser = (user: { id: string; email: string } | null, activeOrganizationId: string | null) => {
    currentSession = user
      ? { user: { id: user.id, email: user.email }, session: { activeOrganizationId } }
      : null
  }

  const list = async (query = '', id = projectId) => {
    const { GET } = await import('./route')
    return GET(new Request(`http://localhost/api/projects/${id}/deployments${query}`), {
      params: Promise.resolve({ id }),
    })
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma

    owner = await prisma.user.create({
      data: { name: 'owner', email: `depl-owner-${stamp}@exemple.fr` },
    })
    member = await prisma.user.create({
      data: { name: 'member', email: `depl-member-${stamp}@exemple.fr` },
    })
    outsider = await prisma.user.create({
      data: { name: 'outsider', email: `depl-outsider-${stamp}@exemple.fr` },
    })

    const org = await prisma.organization.create({
      data: {
        name: 'depl',
        slug: `depl-${stamp}`,
        members: { create: [{ userId: owner.id, role: 'owner' }, { userId: member.id, role: 'member' }] },
      },
    })
    const outsiderOrg = await prisma.organization.create({
      data: {
        name: 'depl-autre',
        slug: `depl-autre-${stamp}`,
        members: { create: { userId: outsider.id, role: 'owner' } },
      },
    })
    orgId = org.id
    outsiderOrgId = outsiderOrg.id

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        userId: owner.id,
        name: 'Historique',
        slug: `depl-projet-${stamp}`,
        repoUrl: 'https://github.com/exemple/historique',
        framework: 'node',
      },
      select: { id: true },
    })
    projectId = project.id

    const other = await prisma.project.create({
      data: {
        organizationId: orgId,
        userId: owner.id,
        name: 'Autre',
        slug: `depl-autre-projet-${stamp}`,
        repoUrl: 'https://github.com/exemple/autre',
        framework: 'node',
      },
      select: { id: true },
    })
    otherProjectId = other.id

    // Dates explicites : l'ordre de pagination ne dépend pas de la vitesse d'insertion.
    const base = new Date('2026-01-01T10:00:00.000Z').getTime()
    const statuses = ['live', 'failed', 'live', 'building', 'live']
    for (const [index, status] of statuses.entries()) {
      const deployment = await prisma.deployment.create({
        data: {
          projectId,
          status,
          commitSha: `${index}`.repeat(40).slice(0, 40),
          createdAt: new Date(base + index * 60_000),
        },
        select: { id: true, status: true },
      })
      expected.push(deployment)
    }
    expected.reverse() // du plus récent au plus ancien

    await prisma.deployment.create({
      data: {
        projectId: otherProjectId,
        status: 'live',
        commitSha: 'f'.repeat(40),
        createdAt: new Date(base + 10 * 60_000),
      },
    })
  })

  afterAll(async () => {
    const { prisma: client } = await import('@/lib/prisma')
    await client.$disconnect()
  })

  it('renvoie 401 sans session et 404 pour un utilisateur d’une autre organisation', async () => {
    asUser(null, null)
    expect((await list()).status).toBe(401)

    asUser(outsider, outsiderOrgId)
    expect((await list()).status).toBe(404)
  })

  it('autorise un simple membre de l’organisation en lecture', async () => {
    asUser(member, orgId)
    const response = await list()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.deployments).toHaveLength(5)
    expect(body.nextCursor).toBeNull()
  })

  it('pagine par curseur, du plus récent au plus ancien', async () => {
    asUser(owner, orgId)

    const first = await (await list('?limit=2')).json()
    expect(first.deployments.map((item: { id: string }) => item.id)).toEqual(
      expected.slice(0, 2).map((item) => item.id),
    )
    expect(first.deployments[0].label).toBe('En ligne')
    expect(first.nextCursor).toBe(expected[1]!.id)

    const second = await (await list(`?limit=2&before=${first.nextCursor}`)).json()
    expect(second.deployments.map((item: { id: string }) => item.id)).toEqual(
      expected.slice(2, 4).map((item) => item.id),
    )
    expect(second.nextCursor).toBe(expected[3]!.id)

    const third = await (await list(`?limit=2&before=${second.nextCursor}`)).json()
    expect(third.deployments.map((item: { id: string }) => item.id)).toEqual([expected[4]!.id])
    expect(third.nextCursor).toBeNull()
  })

  it('filtre par statut', async () => {
    asUser(owner, orgId)
    const body = await (await list('?status=live&limit=2')).json()
    expect(body.deployments.map((item: { id: string }) => item.id)).toEqual(
      expected.filter((item) => item.status === 'live').slice(0, 2).map((item) => item.id),
    )
    expect(body.nextCursor).not.toBeNull()

    const rest = await (await list(`?status=live&limit=2&before=${body.nextCursor}`)).json()
    expect(rest.deployments).toHaveLength(1)
    expect(rest.deployments[0].status).toBe('live')
  })

  it('ne mélange jamais les déploiements de deux projets de la même organisation', async () => {
    asUser(owner, orgId)
    const body = await (await list('?limit=50')).json()
    expect(body.deployments.map((item: { id: string }) => item.id)).toEqual(
      expected.map((item) => item.id),
    )
    const other = await (await list('?limit=50', otherProjectId)).json()
    expect(other.deployments).toHaveLength(1)
    expect(other.deployments[0].commitSha).toBe('f'.repeat(40))
  })

  it('refuse un statut inconnu et un curseur invalide (400)', async () => {
    asUser(owner, orgId)
    expect((await list('?status=perdu')).status).toBe(400)
    expect((await list('?before=inexistant')).status).toBe(400)
  })

  it('borne la limite demandée', async () => {
    asUser(owner, orgId)
    const body = await (await list('?limit=0')).json()
    expect(body.deployments).toHaveLength(1)
    const huge = await (await list('?limit=9999')).json()
    expect(huge.deployments).toHaveLength(5)
  })
})
