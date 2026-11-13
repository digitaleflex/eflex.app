import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeGitHub } from '@/lib/test-support/fake-github'

vi.mock('@/lib/session', () => ({
  getSession: async () => ({ user: { id: 'test-user' }, session: { activeOrganizationId: 'test-org' } }),
}))
// La route rattache l'analyse à l'organisation active (#22) : on simule un membre sans toucher à la base.
vi.mock('@/lib/organizations', () => ({
  resolveOrganization: async () => ({ organizationId: 'test-org', role: 'owner' }),
}))
vi.mock('@/lib/rate-limit', () => ({ allow: async () => true, allowOrg: async () => true }))
vi.mock('@/lib/git-credentials', () => ({ resolveUserRepoToken: async () => null }))

const json = (value: unknown) => JSON.stringify(value)

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

async function analyze(body: unknown) {
  const { POST } = await import('./route')
  const response = await POST(
    new Request('http://localhost/api/projects/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  )
  return { response, payload: (await response.json()) as Record<string, unknown> }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/projects/analyze', () => {
  it('renvoie la liste `apps` sans casser `detection`, `repo` et `incomplete`', async () => {
    const gh = fakeGitHub({ 'acme/shop': { files: monorepo } })
    vi.stubGlobal('fetch', gh.fetch)

    const { response, payload } = await analyze({ repoUrl: 'https://github.com/acme/shop' })

    expect(response.status).toBe(200)
    expect(payload.repo).toMatchObject({ owner: 'acme', repo: 'shop' })
    expect(payload.incomplete).toBe(false)

    // Contrat existant conservé : pas de plan inventé, la question `app` reste posée.
    const detection = payload.detection as { plan: unknown; questions: { id: string; options?: string[] }[] }
    expect(detection.plan).toBeNull()
    expect(detection.questions[0]).toMatchObject({ id: 'app', options: ['apps/api', 'apps/web'] })

    const apps = payload.apps as { root: string; name: string; framework: string }[]
    expect(apps.map(({ root, name, framework }) => ({ root, name, framework }))).toEqual([
      { root: 'apps/api', name: 'api', framework: 'node' },
      { root: 'apps/web', name: 'web', framework: 'nextjs' },
    ])
  })

  it('garde l’analyse principale sur le `root` choisi et la liste complète', async () => {
    const gh = fakeGitHub({ 'acme/shop': { files: monorepo } })
    vi.stubGlobal('fetch', gh.fetch)

    const { payload } = await analyze({ repoUrl: 'https://github.com/acme/shop', root: 'apps/web' })

    const detection = payload.detection as { framework: string; plan: { root: string } | null }
    expect(detection.framework).toBe('nextjs')
    expect(detection.plan?.root).toBe('apps/web')
    expect((payload.apps as { root: string }[]).map((app) => app.root)).toEqual(['apps/api', 'apps/web'])
  })
})
