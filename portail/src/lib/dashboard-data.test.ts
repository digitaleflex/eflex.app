import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

const SECRET_LOG = 'DATABASE_URL=postgres://secret-value'
const FAILED_LOG = `${SECRET_LOG}\nnpm error code 1\nCommand failed with exit code 1`

run('loadDashboard : diagnostics et journaux', () => {
  const stamp = `${Date.now()}`
  const hours = (n: number) => new Date(Date.now() - n * 3_600_000)
  let organizationId = ''
  let userId = ''
  const ids = { failedNow: '', recovered: '', quiet: '' }

  beforeAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.create({
      data: { name: 'Tableau test', email: `dash-${stamp}@exemple.fr`, emailVerified: true },
    })
    userId = user.id
    const organization = await prisma.organization.create({ data: { name: 'Orga tableau', slug: `dash-${stamp}` } })
    organizationId = organization.id

    const makeProject = async (key: keyof typeof ids, deployments: { status: string; at: number; logs?: string }[]) => {
      const project = await prisma.project.create({
        data: {
          organizationId,
          userId,
          name: `Projet ${key}`,
          slug: `${key.toLowerCase()}-${stamp}`,
          repoUrl: 'https://github.com/awa/boutique',
          framework: 'nextjs',
          plan: { framework: 'nextjs', runtime: 'node@22', root: '', port: 3000 },
        },
      })
      ids[key] = project.id
      for (const d of deployments) {
        await prisma.deployment.create({
          data: {
            projectId: project.id,
            commitSha: `sha-${key}-${d.at}`,
            status: d.status,
            createdAt: hours(d.at),
            logsSummary: d.logs ?? null,
          },
        })
      }
    }

    // Dernier déploiement en échec : le diagnostic doit apparaître.
    await makeProject('failedNow', [
      { status: 'live', at: 5 },
      { status: 'failed', at: 1, logs: FAILED_LOG },
    ])
    // Échec ancien corrigé par un déploiement réussi plus récent : rien à signaler.
    await makeProject('recovered', [
      { status: 'failed', at: 6, logs: FAILED_LOG },
      { status: 'live', at: 2 },
    ])
    await makeProject('quiet', [{ status: 'live', at: 3 }])
  })

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.organization.deleteMany({ where: { id: organizationId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('diagnostique uniquement l’échec du dernier déploiement', async () => {
    const { loadDashboard } = await import('@/lib/dashboard-data')
    const data = await loadDashboard(organizationId)
    const failed = data.attention.filter((a) => a.kind === 'failed')
    expect(failed.map((a) => ('projectId' in a ? a.projectId : null))).toEqual([ids.failedNow])
    const item = failed[0]
    expect(item && 'diagnosis' in item ? item.diagnosis : null).not.toBeNull()
  })

  it('conserve la frise et le dernier statut de chaque projet', async () => {
    const { loadDashboard } = await import('@/lib/dashboard-data')
    const data = await loadDashboard(organizationId)
    const byId = new Map(data.projects.map((p) => [p.id, p]))
    expect(byId.get(ids.failedNow)).toMatchObject({ lastStatus: 'failed', history: ['live', 'failed'] })
    expect(byId.get(ids.recovered)).toMatchObject({ lastStatus: 'live', history: ['failed', 'live'] })
    expect(byId.get(ids.quiet)).toMatchObject({ lastStatus: 'live', history: ['live'] })
  })

  it('n’expose jamais le journal brut dans les données renvoyées', async () => {
    const { loadDashboard } = await import('@/lib/dashboard-data')
    const serialized = JSON.stringify(await loadDashboard(organizationId))
    expect(serialized).not.toContain('secret-value')
    expect(serialized).not.toContain('logsSummary')
  })
})
