import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

const LOGS = JSON.stringify([
  { output: 'Clonage du dépôt' },
  { output: 'DATABASE_URL=postgres://u:motdepasse-secret@h/db' },
  { output: '\u001b[32mBuild terminé\u001b[0m' },
])

/** Lit un flux SSE jusqu'à sa fermeture et renvoie les événements. */
async function readSse(res: Response) {
  const text = await res.text()
  return text
    .split('\n\n')
    .filter((b) => b.includes('event:'))
    .map((block) => {
      const get = (k: string) => block.split('\n').filter((l) => l.startsWith(`${k}:`)).map((l) => l.slice(k.length + 1).trim()).join('\n')
      return { id: get('id'), event: get('event'), data: JSON.parse(get('data') || 'null') }
    })
}

run('GET /api/projects/[id]/deployments/[deploymentId]/logs', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  Object.assign(process.env, { COOLIFY_API_URL: 'http://coolify.test/api/v1', COOLIFY_API_TOKEN: 't' })
  // Les variables sont chiffrées en base (AES-256-GCM) : le test le fait aussi, pour vérifier le masquage.
  process.env.ENV_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')

  const stamp = `${Date.now()}`
  let owner: { id: string; email: string }, stranger: { id: string; email: string }
  let projectId = '', deploymentId = '', noCoolifyId = ''

  const asUser = async (u: { id: string } | null) => {
    const { resolveOrganization } = await import('@/lib/organizations')
    currentSession = u ? { user: { id: u.id }, session: { activeOrganizationId: null } } : null
    void resolveOrganization
  }
  const get = async (path: string, init?: RequestInit) => {
    const { GET } = await import('./route')
    return GET(new Request(`http://localhost${path}`, init), { params: Promise.resolve({ id: projectId, deploymentId }) })
  }

  beforeAll(async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/deployments/depabc123')) {
        return new Response(JSON.stringify({ deployment_uuid: 'depabc123', status: 'finished', logs: LOGS }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('{}', { status: 404 })
    })
    const { prisma } = await import('@/lib/prisma')
    const mk = (n: string) => prisma.user.create({ data: { name: n, email: `${n}-${stamp}@exemple.fr` } })
    owner = await mk('owner')
    stranger = await mk('stranger')
    for (const u of [owner, stranger]) {
      await prisma.organization.create({ data: { name: u.email, slug: `o-${u.id}`, members: { create: { userId: u.id, role: 'owner' } } } })
    }
    const org = await prisma.member.findFirstOrThrow({ where: { userId: owner.id } })
    const project = await prisma.project.create({
      data: {
        organizationId: org.organizationId, userId: owner.id, name: 'P', slug: `p-${stamp}`, repoUrl: 'https://github.com/a/b', framework: 'node',
        deployments: {
          create: [
            { commitSha: 'pending', status: 'building', coolifyBuildId: 'depabc123' },
            { commitSha: 'pending', status: 'failed', logsSummary: 'Coolify non configuré' },
          ],
        },
      },
      include: { deployments: { orderBy: { createdAt: 'asc' } } },
    })
    const { encrypt } = await import('@/lib/crypto')
    await prisma.envVar.create({ data: { projectId: project.id, key: 'DATABASE_URL', value: encrypt('postgres://u:motdepasse-secret@h/db', `${project.id}:DATABASE_URL`) } })
    projectId = project.id
    deploymentId = project.deployments[0]!.id
    noCoolifyId = project.deployments[1]!.id
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('401 sans session, 404 pour un utilisateur d’une autre organisation', async () => {
    await asUser(null)
    expect((await get('/x')).status).toBe(401)
    await asUser(stranger)
    expect((await get('/x')).status).toBe(404)
  })

  it('diffuse les lignes, masque les secrets (déchiffrés), ne touche pas à l’état et termine', async () => {
    await asUser(owner)
    const res = await get('/x')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')

    const events = await readSse(res)
    const lines = events.filter((e) => e.event === 'log').flatMap((e) => e.data.lines.map((l: { text: string }) => l.text))
    expect(lines).toEqual(['Clonage du dépôt', 'DATABASE_URL=***', '\u001b[32mBuild terminé\u001b[0m'])
    expect(JSON.stringify(events)).not.toContain('motdepasse-secret')
    expect(events.find((e) => e.event === 'status')!.data.status).toBe('live')
    expect(events.at(-1)).toMatchObject({ event: 'end' })

    // Lecture seule : l'état du déploiement appartient au worker (machine à états), pas à ce flux.
    const { prisma } = await import('@/lib/prisma')
    const row = await prisma.deployment.findUniqueOrThrow({ where: { id: deploymentId } })
    expect(row.status).toBe('building')
  })

  it('reprend après la dernière ligne reçue (Last-Event-ID)', async () => {
    await asUser(owner)
    const events = await readSse(await get('/x', { headers: { 'last-event-id': '1' } }))
    const lines = events.filter((e) => e.event === 'log').flatMap((e) => e.data.lines.map((l: { text: string }) => l.text))
    expect(lines).toEqual(['\u001b[32mBuild terminé\u001b[0m'])
  })

  it('rejoue le résumé d’un déploiement qui n’est jamais parti chez Coolify', async () => {
    await asUser(owner)
    deploymentId = noCoolifyId
    const events = await readSse(await get('/x'))
    expect(events.filter((e) => e.event === 'log').flatMap((e) => e.data.lines.map((l: { text: string }) => l.text))).toEqual(['Coolify non configuré'])
    expect(events.find((e) => e.event === 'status')!.data.status).toBe('failed')
  })
})
