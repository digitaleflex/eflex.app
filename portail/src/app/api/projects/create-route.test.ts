import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeGitHub } from '@/lib/test-support/fake-github'

// Intégration : EFLEX_TEST_DB=1 + base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))
vi.mock('@/lib/rate-limit', () => ({ allow: async () => true }))
vi.mock('@/lib/git-credentials', () => ({ resolveUserRepoToken: async () => null }))

const queueMock = vi.hoisted(() => ({ calls: [] as string[], fail: false }))
vi.mock('@/lib/queue', () => ({
  enqueueDeployment: async (id: string) => {
    if (queueMock.fail) throw new Error('Redis indisponible')
    queueMock.calls.push(id)
  },
  removeQueuedDeployment: async () => 'removed',
}))

const json = (value: unknown) => JSON.stringify(value)
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

const monorepo = {
  'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
  'apps/web/package.json': json({
    name: '@acme/web',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
  }),
  'apps/web/next.config.js': 'module.exports = {}\n',
  'apps/api/package.json': json({
    name: '@acme/api',
    scripts: { start: 'node server.js' },
    dependencies: { express: '^4.19.0' },
  }),
  'apps/api/server.js': 'console.log("api")\n',
}

let prisma: typeof import('@/lib/prisma').prisma

async function createOrganization(label: string) {
  const user = await prisma.user.create({
    data: { name: label, email: `${label}-${stamp}-${Math.random().toString(36).slice(2, 6)}@exemple.fr` },
  })
  const organization = await prisma.organization.create({
    data: {
      name: `Org ${label}`,
      slug: `org-${label}-${stamp}-${Math.random().toString(36).slice(2, 6)}`.toLowerCase(),
      members: { create: { userId: user.id, role: 'owner' } },
    },
  })
  currentSession = {
    user: { id: user.id, email: user.email },
    session: { activeOrganizationId: organization.id },
  }
  return { user, organization }
}

async function createProject(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/projects/route')
  const response = await POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  )
  return { response, payload: (await response.json()) as Record<string, unknown> }
}

const baseBody = (name: string) => ({
  name,
  repoUrl: 'https://github.com/acme/shop',
  branch: 'main',
})

run('POST /api/projects — création multi-applications (D2, lot C)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.ENV_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
  process.env.PORTAL_DOMAIN = 'eflex.test'

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
  })

  beforeEach(() => {
    process.env.EFLEX_MULTI_APP = '1'
    queueMock.calls = []
    queueMock.fail = false
    vi.stubGlobal('fetch', fakeGitHub({ 'acme/shop': { files: monorepo } }).fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    delete process.env.EFLEX_MULTI_APP
    const { prisma: client } = await import('@/lib/prisma')
    await client.$disconnect()
  })

  it('re-analyse chaque app et crée une ligne Deployment par app, même groupId', async () => {
    await createOrganization('multi')
    const { response, payload } = await createProject({
      ...baseBody(`Boutique ${stamp}`),
      apps: [
        { root: 'apps/web', framework: 'nextjs', primary: true },
        { root: 'apps/api', framework: 'node' },
      ],
    })

    expect(response.status).toBe(202)
    expect(payload.warning).toBeNull()
    const apps = payload.apps as Array<{ id: string; name: string; root: string; domain: string; deploymentId: string }>
    expect(apps.map((app) => app.root)).toEqual(['apps/web', 'apps/api'])
    expect(apps.map((app) => app.name)).toEqual(['web', 'api'])
    // L'app principale garde `<slug>.<racine>`, l'autre un seul label.
    expect(apps[0]!.domain).toMatch(/\.eflex\.test$/)
    expect(apps[0]!.domain.split('.')[0]).not.toContain('-api')
    expect(apps[1]!.domain.split('.')[0]).toMatch(/-api$/)
    expect(payload.groupId).toBeTruthy()

    const projectId = (payload.project as { id: string }).id
    const rows = await prisma.deployment.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } })
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.groupId))).toEqual(new Set([payload.groupId]))
    expect(new Set(rows.map((row) => row.appId))).toEqual(new Set(apps.map((app) => app.id)))
    expect(queueMock.calls).toHaveLength(2)
    expect(rows.every((row) => row.status === 'queued')).toBe(true)
  })

  it('crée quand même une ProjectApp et un Deployment avec appId pour une création mono-app', async () => {
    await createOrganization('mono')
    const { response, payload } = await createProject({
      ...baseBody(`Solo ${stamp}`),
      root: 'apps/web',
      framework: 'nextjs',
    })
    expect(response.status).toBe(202)

    const projectId = (payload.project as { id: string }).id
    const apps = await prisma.projectApp.findMany({ where: { projectId } })
    expect(apps).toHaveLength(1)
    const deployments = await prisma.deployment.findMany({ where: { projectId } })
    expect(deployments).toHaveLength(1)
    expect(deployments[0]!.appId).toBe(apps[0]!.id)
    expect(deployments[0]!.groupId).toBeNull()
  })

  it('refuse plus d’une application quand EFLEX_MULTI_APP est désactivé', async () => {
    process.env.EFLEX_MULTI_APP = '0'
    const { organization } = await createOrganization('flag-off')
    const { response, payload } = await createProject({
      ...baseBody(`Off ${stamp}`),
      apps: [
        { root: 'apps/web', framework: 'nextjs', primary: true },
        { root: 'apps/api', framework: 'node' },
      ],
    })

    expect(response.status).toBe(403)
    expect(payload.code).toBe('multi_app_disabled')
    expect(payload.error).toContain('désactivé')
    expect(await prisma.project.count({ where: { organizationId: organization.id } })).toBe(0)
  })

  it('refuse en bloc une création qui dépasse le quota d’applications', async () => {
    const { user, organization } = await createOrganization('quota')
    // 4 applications déjà déployées sur 5 autorisées par le plan gratuit.
    for (let index = 0; index < 4; index += 1) {
      const project = await prisma.project.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          name: `Existant ${index}`,
          slug: `existant-${index}-${stamp}-${Math.random().toString(36).slice(2, 5)}`,
          repoUrl: 'https://github.com/exemple/existant',
          framework: 'nextjs',
        },
      })
      await prisma.projectApp.create({
        data: {
          projectId: project.id,
          name: 'web',
          root: '',
          position: 0,
          plan: { framework: 'nextjs', port: 3000, root: '' },
          framework: 'nextjs',
          domain: `existant-${index}-${stamp}-${Math.random().toString(36).slice(2, 5)}.eflex.test`,
        },
      })
    }

    const { response, payload } = await createProject({
      ...baseBody(`Trop ${stamp}`),
      apps: [
        { root: 'apps/web', framework: 'nextjs', primary: true },
        { root: 'apps/api', framework: 'node' },
      ],
    })

    expect(response.status).toBe(403)
    expect(payload.code).toBe('plan_limit')
    expect(payload.required).toBe(2)
    expect(payload.limit).toBe(5)
    expect(payload.used).toBe(4)
    expect(payload.error).toContain('2 applications')
    // Aucune écriture : ni projet, ni application, ni déploiement.
    expect(await prisma.project.count({ where: { organizationId: organization.id } })).toBe(4)
  })

  it('renvoie 409 quand le framework demandé ne correspond plus au commit analysé', async () => {
    await createOrganization('conflit')
    const { response, payload } = await createProject({
      ...baseBody(`Conflit ${stamp}`),
      apps: [{ root: 'apps/web', framework: 'python', primary: true }],
    })
    expect(response.status).toBe(409)
    expect(payload.code).toBe('app_framework_changed')
  })
})
