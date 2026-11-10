import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { UNBLOCK_NOTE } from '@/lib/admin-projects'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

// Aucune dépendance réseau : la file et l'hébergement sont simulés.
vi.mock('@/lib/queue', () => ({
  enqueueDeployment: vi.fn(async () => undefined),
  removeQueuedDeployment: vi.fn(async () => 'removed' as const),
}))

vi.mock('@/lib/coolify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coolify')>()
  return {
    ...actual,
    applicationAction: vi.fn(async () => ({ ok: true as const })),
    deleteApplication: vi.fn(async () => ({ ok: true as const })),
    cancelDeployment: vi.fn(async () => ({ ok: true as const })),
    getDeploymentDetails: vi.fn(async () => ({
      status: 'finished',
      logs: JSON.stringify([
        { output: 'npm run build avec super-secret-value', timestamp: '2026-11-10T10:00:00.000Z' },
        { output: 'terminé', timestamp: '2026-11-10T10:02:30.000Z' },
      ]),
    })),
  }
})

const SECRET = 'super-secret-value'

run('API d’administration : projets et déploiements (#28)', () => {
  const stamp = `${Date.now()}`
  type Session = { user: { id: string; email: string; role: string; banned: boolean } }
  const admin: Session = { user: { id: 'admin-test', email: `admin-${stamp}@exemple.fr`, role: 'admin', banned: false } }
  const regular: Session = { user: { id: 'user-test', email: `user-${stamp}@exemple.fr`, role: 'user', banned: false } }

  const as = (session: Session | null) => {
    currentSession = session
  }
  const call = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)
  const json = (body: unknown, method = 'POST') =>
    call('/x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) })

  let organizationId = ''
  let projectId = ''
  let deploymentId = ''

  beforeAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.create({
      data: { name: 'Admin test', email: `admin-${stamp}@exemple.fr`, role: 'admin', emailVerified: true },
    })
    admin.user.id = user.id

    const organization = await prisma.organization.create({
      data: { name: 'Organisation test', slug: `orga-${stamp}` },
    })
    organizationId = organization.id

    const project = await prisma.project.create({
      data: {
        organizationId,
        userId: user.id,
        name: 'Projet test admin',
        slug: `projet-${stamp}`,
        repoUrl: 'https://github.com/awa/boutique',
        framework: 'nextjs',
        plan: { framework: 'nextjs', runtime: 'node@22', root: '', port: 3000 },
        coolifyAppId: 'app-1',
      },
    })
    projectId = project.id

    const deployment = await prisma.deployment.create({
      data: { projectId, commitSha: 'abc123def456', status: 'live', coolifyBuildId: 'build-1' },
    })
    deploymentId = deployment.id
  })

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.auditLog.deleteMany({ where: { actorEmail: admin.user.email } })
    await prisma.organization.deleteMany({ where: { id: organizationId } })
    await prisma.user.deleteMany({ where: { id: admin.user.id } })
    await prisma.$disconnect()
  })

  it('répond 404 à un non-administrateur sur toutes les routes', async () => {
    const { POST: redeploy } = await import('@/app/api/admin/projects/[id]/redeploy/route')
    const { POST: runtime } = await import('@/app/api/admin/projects/[id]/runtime/route')
    const { DELETE: infrastructure } = await import('@/app/api/admin/projects/[id]/infrastructure/route')
    const { POST: unblock } = await import(
      '@/app/api/admin/projects/[id]/deployments/[deploymentId]/unblock/route'
    )
    const { POST: cancel } = await import(
      '@/app/api/admin/projects/[id]/deployments/[deploymentId]/cancel/route'
    )
    const { GET: logs } = await import('@/app/api/admin/projects/[id]/deployments/[deploymentId]/logs/route')

    as(regular)
    const params = ctx({ id: projectId, deploymentId })
    expect((await redeploy(json({}), ctx({ id: projectId }))).status).toBe(404)
    expect((await runtime(json({ action: 'start' }), ctx({ id: projectId }))).status).toBe(404)
    expect((await infrastructure(json({ confirmName: 'x', reason: 'motif' }, 'DELETE'), ctx({ id: projectId }))).status).toBe(404)
    expect((await unblock(json({}), params)).status).toBe(404)
    expect((await cancel(json({ reason: 'motif' }), params)).status).toBe(404)
    expect((await logs(call('/x'), params)).status).toBe(404)
  })

  it('redéploie un projet et journalise l’action', async () => {
    const { POST } = await import('@/app/api/admin/projects/[id]/redeploy/route')
    const { prisma } = await import('@/lib/prisma')
    as(admin)

    const response = await POST(json({ reason: 'Test de redéploiement' }), ctx({ id: projectId }))
    expect(response.status).toBe(202)
    const body = (await response.json()) as { deployment: { id: string; status: string } }
    expect(body.deployment.status).toBe('queued')

    const audit = await prisma.auditLog.findFirst({ where: { action: 'project.redeploy', targetId: projectId } })
    expect(audit?.actorEmail).toBe(admin.user.email)
    expect(JSON.stringify(audit?.details)).toContain('Test de redéploiement')
  })

  it('refuse un second déploiement actif (409 explicite)', async () => {
    const { POST } = await import('@/app/api/admin/projects/[id]/redeploy/route')
    as(admin)
    const response = await POST(json({}), ctx({ id: projectId }))
    expect(response.status).toBe(409)
    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('deployment_in_progress')
  })

  it('démarre, arrête et redémarre l’application (motif exigé pour les actions interruptives)', async () => {
    const { POST } = await import('@/app/api/admin/projects/[id]/runtime/route')
    as(admin)
    expect((await POST(json({ action: 'start' }), ctx({ id: projectId }))).status).toBe(200)
    expect((await POST(json({ action: 'stop' }), ctx({ id: projectId }))).status).toBe(400)
    expect((await POST(json({ action: 'stop', reason: 'Intervention de maintenance' }), ctx({ id: projectId }))).status).toBe(200)
    expect((await POST(json({ action: 'restart', reason: 'Mise à jour du proxy' }), ctx({ id: projectId }))).status).toBe(200)
  })

  it('débloque un déploiement actif en le passant en échec avec le motif imposé', async () => {
    const { POST } = await import('@/app/api/admin/projects/[id]/deployments/[deploymentId]/unblock/route')
    const { prisma } = await import('@/lib/prisma')
    as(admin)

    // Le redéploiement précédent a laissé un job actif : on le termine pour
    // tester explicitement le déblocage d'un build en cours.
    await prisma.deployment.updateMany({
      where: { projectId, status: { in: ['queued', 'analyzing', 'provisioning', 'building', 'deploying'] } },
      data: { status: 'cancelled' },
    })
    const active = await prisma.deployment.create({
      data: { projectId, commitSha: 'fed456abc789', status: 'building', coolifyBuildId: 'build-1' },
    })
    deploymentId = active.id

    const response = await POST(json({ comment: 'Test de déblocage' }), ctx({ id: projectId, deploymentId }))
    expect(response.status).toBe(200)

    const deployment = await prisma.deployment.findUniqueOrThrow({ where: { id: deploymentId } })
    expect(deployment.status).toBe('failed')
    expect(deployment.logsSummary).toContain(UNBLOCK_NOTE)

    const audit = await prisma.auditLog.findFirst({ where: { action: 'deployment.unblock', targetId: deploymentId } })
    expect(JSON.stringify(audit?.details)).toContain('Test de déblocage')
  })

  it('refuse de débloquer un déploiement déjà terminé', async () => {
    const { POST } = await import('@/app/api/admin/projects/[id]/deployments/[deploymentId]/unblock/route')
    as(admin)
    const response = await POST(json({}), ctx({ id: projectId, deploymentId }))
    expect(response.status).toBe(409)
  })

  it('annule un déploiement actif avec un motif tracé', async () => {
    const { POST } = await import('@/app/api/admin/projects/[id]/deployments/[deploymentId]/cancel/route')
    const { prisma } = await import('@/lib/prisma')
    as(admin)

    const queued = await prisma.deployment.create({
      data: { projectId, commitSha: 'bcd234efg567', status: 'queued' },
    })
    expect((await POST(json({}), ctx({ id: projectId, deploymentId: queued.id }))).status).toBe(400)

    const response = await POST(
      json({ reason: 'Blocage constaté en production' }),
      ctx({ id: projectId, deploymentId: queued.id }),
    )
    expect(response.status).toBe(200)
    const updated = await prisma.deployment.findUniqueOrThrow({ where: { id: queued.id } })
    expect(updated.status).toBe('cancelled')
    expect(updated.logsSummary).toContain('Blocage constaté en production')
  })

  it('supprime l’application côté infrastructure avec confirmation par nom', async () => {
    const { DELETE } = await import('@/app/api/admin/projects/[id]/infrastructure/route')
    const { prisma } = await import('@/lib/prisma')
    as(admin)

    const wrong = await DELETE(
      json({ confirmName: 'Mauvais nom', reason: 'Nettoyage' }, 'DELETE'),
      ctx({ id: projectId }),
    )
    expect(wrong.status).toBe(400)

    const response = await DELETE(
      json({ confirmName: 'Projet test admin', reason: 'Application abandonnée' }, 'DELETE'),
      ctx({ id: projectId }),
    )
    expect(response.status).toBe(200)
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.coolifyAppId).toBeNull()
  })

  it('lit les journaux avec secrets masqués et écrit une entrée d’audit', async () => {
    const { GET } = await import('@/app/api/admin/projects/[id]/deployments/[deploymentId]/logs/route')
    const { prisma } = await import('@/lib/prisma')
    as(admin)

    await prisma.envVar.create({ data: { projectId, key: 'API_KEY', value: SECRET } })

    const response = await GET(call('/x'), ctx({ id: projectId, deploymentId }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      logs: string
      source: string
      range: { durationMs: number } | null
    }
    expect(body.logs).not.toContain(SECRET)
    expect(body.logs).toContain('***')
    expect(body.source).toBe('coolify')
    expect(body.range?.durationMs).toBe(150_000)

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'deployment.logs.view', targetId: deploymentId },
    })
    expect(audit).not.toBeNull()
    expect(JSON.stringify(audit?.details)).not.toContain(SECRET)
  })
})
