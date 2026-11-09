import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

run('loadDashboard : agrégation SQL', () => {
  const stamp = `${Date.now()}`
  const now = new Date('2026-11-08T12:00:00Z')
  let orgId = '', otherOrgId = ''

  beforeAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.create({ data: { name: 'U', email: `u-${stamp}@exemple.fr` } })
    const mk = async (slug: string) => {
      const org = await prisma.organization.create({ data: { name: slug, slug: `${slug}-${stamp}`, members: { create: { userId: user.id, role: 'owner' } } } })
      const project = await prisma.project.create({
        data: { organizationId: org.id, userId: user.id, name: slug, slug: `${slug}-p-${stamp}`, repoUrl: 'https://github.com/a/b', framework: 'node' },
      })
      return { org, project }
    }
    const a = await mk('a')
    const b = await mk('b')
    orgId = a.org.id
    otherOrgId = b.org.id
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000)
    const rows = (projectId: string, status: string, daysAgo: number, n: number) =>
      Array.from({ length: n }, () => ({ projectId, status, commitSha: 'abc1234', createdAt: at(daysAgo) }))
    await prisma.deployment.createMany({
      data: [
        ...rows(a.project.id, 'live', 0, 5_200), // plus que l'ancienne limite de 5000 lignes
        ...rows(a.project.id, 'failed', 1, 40),
        ...rows(a.project.id, 'building', 0, 3),
        ...rows(a.project.id, 'live', 40, 7), // hors fenêtre de 14 jours
        ...rows(b.project.id, 'failed', 0, 999), // autre organisation : ne doit jamais compter
      ],
    })
  })
  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('compte tout sur la fenêtre, sans troncature à 5000 lignes', async () => {
    const { loadDashboard } = await import('@/lib/dashboard-data')
    const data = await loadDashboard(orgId, now)
    expect(data.deploymentsInWindow).toBe(5_200 + 40 + 3)
    const today = data.series.at(-1)!
    expect(today).toMatchObject({ day: '2026-11-08', live: 5_200, failed: 0, other: 3 })
    expect(data.series.at(-2)).toMatchObject({ day: '2026-11-07', failed: 40 })
    expect(data.series).toHaveLength(14)
  })

  it('calcule le taux de réussite sur les déploiements terminés, sans mélanger les organisations', async () => {
    const { loadDashboard } = await import('@/lib/dashboard-data')
    const data = await loadDashboard(orgId, now)
    expect(data.successRate).toBe(Math.round((5_200 / (5_200 + 40)) * 100)) // 99
    const other = await loadDashboard(otherOrgId, now)
    expect(other.deploymentsInWindow).toBe(999)
    expect(other.successRate).toBe(0)
  })
})
