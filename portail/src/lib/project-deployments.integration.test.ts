import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : EFLEX_TEST_DB=1 + base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

const queueMock = vi.hoisted(() => ({
  calls: [] as Array<{ id: string; rollback?: boolean }>,
  fail: false,
}))

vi.mock('@/lib/queue', () => ({
  enqueueDeployment: async (id: string, options?: { rollback?: boolean }) => {
    if (queueMock.fail) throw new Error('Redis indisponible')
    queueMock.calls.push({ id, ...(options?.rollback ? { rollback: true } : {}) })
  },
  removeQueuedDeployment: async () => 'removed',
}))

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
let fixtureSeq = 0

let prisma: typeof import('@/lib/prisma').prisma

async function createFixture(appCount = 2) {
  fixtureSeq += 1
  const seq = `${fixtureSeq}-${Math.random().toString(36).slice(2, 5)}`
  const user = await prisma.user.create({
    data: { name: 'Fanout', email: `fanout-${stamp}-${seq}@exemple.fr` },
  })
  const organization = await prisma.organization.create({
    data: {
      name: 'Org fanout',
      slug: `org-fanout-${stamp}-${seq}`,
      members: { create: { userId: user.id, role: 'owner' } },
    },
  })
  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      name: 'Boutique',
      slug: `boutique-${stamp}-${seq}`,
      repoUrl: 'https://github.com/exemple/boutique',
      framework: 'nextjs',
      domain: `boutique-${stamp}-${seq}.eflex.app`,
      plan: { framework: 'nextjs', port: 3000, root: '' },
    },
  })
  const apps = []
  for (let index = 0; index < appCount; index += 1) {
    apps.push(
      await prisma.projectApp.create({
        data: {
          projectId: project.id,
          name: index === 0 ? 'web' : `app-${index}`,
          root: index === 0 ? '' : `apps/app-${index}`,
          position: index,
          plan: { framework: 'nextjs', port: 3000, root: index === 0 ? '' : `apps/app-${index}` },
          framework: 'nextjs',
          port: 3000,
          domain:
            index === 0
              ? `boutique-${stamp}-${seq}.eflex.app`
              : `boutique-app-${index}-${stamp}-${seq}.eflex.app`,
        },
      }),
    )
  }
  return { user, organization, project, apps }
}

run('fan-out des déploiements par application (D2, lot C)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  // Le fan-out par défaut (sans `apps`) est actif avec le drapeau.
  process.env.EFLEX_MULTI_APP = '1'

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
  })

  afterAll(async () => {
    delete process.env.EFLEX_MULTI_APP
    const { prisma: client } = await import('@/lib/prisma')
    await client.$disconnect()
  })

  it('crée une ligne Deployment par application avec le même groupId', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    queueMock.calls = []

    const { project, apps } = await createFixture(3)
    const queued = await enqueueProjectDeployment(project)
    if ('error' in queued) throw new Error(queued.error)

    expect(queued.deployments).toHaveLength(3)
    expect(queued.groupId).toBeTruthy()
    expect(queued.skipped).toEqual([])

    const rows = await prisma.deployment.findMany({ where: { projectId: project.id } })
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((row) => row.groupId))).toEqual(new Set([queued.groupId]))
    expect(new Set(rows.map((row) => row.appId))).toEqual(new Set(apps.map((app) => app.id)))
    expect(rows.every((row) => row.status === 'queued')).toBe(true)
    expect(queueMock.calls).toHaveLength(3)
    expect(new Set(queueMock.calls.map((call) => call.id))).toEqual(new Set(rows.map((row) => row.id)))
  })

  it('ne déploie qu’une application quand `apps` est fourni', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    queueMock.calls = []
    const { project, apps } = await createFixture(2)

    const queued = await enqueueProjectDeployment(project, {
      apps: [{ id: apps[1]!.id, name: apps[1]!.name }],
    })
    if ('error' in queued) throw new Error(queued.error)

    const rows = await prisma.deployment.findMany({ where: { projectId: project.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.appId).toBe(apps[1]!.id)
    expect(rows[0]!.groupId).toBeNull()
  })

  it('ignore une application déjà active sans bloquer les autres', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    queueMock.calls = []
    const { project, apps } = await createFixture(2)

    const active = await prisma.deployment.create({
      data: { projectId: project.id, appId: apps[0]!.id, status: 'building', commitSha: 'a'.repeat(40) },
    })

    const queued = await enqueueProjectDeployment(project, { exclusive: true })
    if ('error' in queued) throw new Error(queued.error)

    expect(queued.skipped).toEqual([{ appId: apps[0]!.id, appName: apps[0]!.name }])
    expect(queued.deployments).toHaveLength(1)
    expect(queued.deployments[0]!.appId).toBe(apps[1]!.id)

    const forActive = await prisma.deployment.findMany({ where: { projectId: project.id, appId: apps[0]!.id } })
    expect(forActive.map((row) => row.id)).toEqual([active.id])
    expect(forActive[0]!.status).toBe('building')
  })

  it('refuse quand toutes les applications visées sont déjà actives', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    const { project, apps } = await createFixture(2)
    await prisma.deployment.createMany({
      data: apps.map((app) => ({
        projectId: project.id,
        appId: app.id,
        status: 'deploying',
        commitSha: 'b'.repeat(40),
      })),
    })

    const queued = await enqueueProjectDeployment(project, { exclusive: true })
    expect('error' in queued && queued.code).toBe('deployment_in_progress')
    expect('error' in queued && queued.error).toContain('déjà en cours')
  })

  it('conserve le commit cible et le drapeau rollback sur le job', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    queueMock.calls = []
    const { project, apps } = await createFixture(2)
    const target = 'c'.repeat(40)

    const queued = await enqueueProjectDeployment(project, {
      apps: [{ id: apps[0]!.id, name: apps[0]!.name }],
      commitSha: target,
      rollback: true,
    })
    if ('error' in queued) throw new Error(queued.error)

    const row = await prisma.deployment.findUniqueOrThrow({ where: { id: queued.deploymentId } })
    expect(row.commitSha).toBe(target)
    expect(row.appId).toBe(apps[0]!.id)
    expect(queueMock.calls[0]).toEqual({ id: row.id, rollback: true })
  })

  it('crée un déploiement de portée projet quand `apps` est vide', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    queueMock.calls = []
    const { project } = await createFixture(2)

    const queued = await enqueueProjectDeployment(project, { apps: [] })
    if ('error' in queued) throw new Error(queued.error)

    const row = await prisma.deployment.findUniqueOrThrow({ where: { id: queued.deploymentId } })
    expect(row.appId).toBeNull()
    expect(row.groupId).toBeNull()
  })

  it('drapeau désactivé : un enfilement sans `apps` reste de portée projet', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    const { project } = await createFixture(2)
    const previous = process.env.EFLEX_MULTI_APP
    process.env.EFLEX_MULTI_APP = '0'
    try {
      const queued = await enqueueProjectDeployment(project)
      if ('error' in queued) throw new Error(queued.error)
      const rows = await prisma.deployment.findMany({ where: { projectId: project.id } })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.appId).toBeNull()
    } finally {
      process.env.EFLEX_MULTI_APP = previous
    }
  })

  it('marque la ligne en échec quand la file est indisponible', async () => {
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')
    const { project, apps } = await createFixture(1)
    queueMock.fail = true
    try {
      const queued = await enqueueProjectDeployment(project, {
        apps: [{ id: apps[0]!.id, name: apps[0]!.name }],
      })
      expect('error' in queued && queued.error).toContain('File')
      const rows = await prisma.deployment.findMany({ where: { projectId: project.id } })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.status).toBe('failed')
    } finally {
      queueMock.fail = false
    }
  })

  it('compte les applications (pas les projets) dans le quota', async () => {
    const { assertProjectQuota } = await import('@/lib/billing')
    const { organization } = await createFixture(4)

    const refused = await assertProjectQuota(organization.id, 2)
    expect('error' in refused).toBe(true)
    if ('error' in refused) {
      expect(refused.required).toBe(2)
      expect(refused.limit).toBe(5)
      expect(refused.used).toBe(4)
      expect(refused.error).toContain('2 applications')
      expect(refused.error).toContain('5')
    }

    // Une seule application supplémentaire tient encore dans le plan gratuit.
    expect((await assertProjectQuota(organization.id, 1)).ok).toBe(true)
  })
})
