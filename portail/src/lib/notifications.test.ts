import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

run('notifications', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  const stamp = `${Date.now()}`
  let owner: string, member: string, outsider: string, orgId: string, projectId: string, deploymentId: string

  beforeAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    const mk = async (n: string) => (await prisma.user.create({ data: { name: n, email: `${n}-${stamp}@exemple.fr` } })).id
    owner = await mk('owner')
    member = await mk('member')
    outsider = await mk('outsider')
    const org = await prisma.organization.create({
      data: { name: 'Acme', slug: `acme-${stamp}`, members: { create: [{ userId: owner, role: 'owner' }, { userId: member, role: 'member' }] } },
    })
    orgId = org.id
    const project = await prisma.project.create({
      data: { organizationId: orgId, userId: owner, name: 'Démo', slug: `demo-${stamp}`, repoUrl: 'https://github.com/a/b', framework: 'node', deployments: { create: { commitSha: 'pending', status: 'building' } } },
      include: { deployments: true },
    })
    projectId = project.id
    deploymentId = project.deployments[0]!.id
  })
  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('notifie chaque destinataire une seule fois par clé d’unicité', async () => {
    const { notify } = await import('@/lib/notifications')
    const { prisma } = await import('@/lib/prisma')
    const input = { userIds: [owner, member], type: 'deployment.succeeded' as const, title: 'Test', dedupeKey: `k-${stamp}` }
    expect(await notify(input)).toHaveLength(2)
    expect(await notify(input)).toHaveLength(0) // même clé : rien de nouveau
    expect(await prisma.notification.count({ where: { dedupeKey: `k-${stamp}` } })).toBe(2)
  })

  it('respecte les préférences : un type désactivé n’est pas envoyé', async () => {
    const { notify } = await import('@/lib/notifications')
    const { prisma } = await import('@/lib/prisma')
    await prisma.notificationPreference.create({ data: { userId: member, type: 'member.joined', channel: 'app', enabled: false } })
    const sent = await notify({ userIds: [owner, member], type: 'member.joined', title: 'Quelqu’un a rejoint', dedupeKey: `j-${stamp}` })
    expect(sent).toEqual([owner])
    // et un autre type reste actif pour la même personne
    expect(await notify({ userIds: [member], type: 'deployment.failed', title: 'Échec', dedupeKey: `f-${stamp}` })).toEqual([member])
  })

  it('refuse un lien externe (redirection ouverte) sans rien créer', async () => {
    const { notify } = await import('@/lib/notifications')
    const { prisma } = await import('@/lib/prisma')
    expect(await notify({ userIds: [owner], type: 'invitation.received', title: 'x', href: 'https://evil.fr', dedupeKey: `e-${stamp}` })).toEqual([])
    expect(await prisma.notification.count({ where: { dedupeKey: `e-${stamp}` } })).toBe(0)
  })

  it('pousse la notification en direct à son destinataire uniquement', async () => {
    const { notify } = await import('@/lib/notifications')
    const { prisma } = await import('@/lib/prisma')
    await notify({ userIds: [owner], type: 'invitation.received', title: 'Direct', dedupeKey: `d-${stamp}` })
    const events = await prisma.event.findMany({ where: { type: 'notification.created', audience: 'user' }, orderBy: { id: 'desc' }, take: 5 })
    const mine = events.find((e) => (e.payload as { title?: string }).title === 'Direct')!
    expect(mine.userId).toBe(owner)
    expect(JSON.stringify(mine.payload)).not.toMatch(/password|secret|token/i)
  })

  it('un déploiement terminé prévient tous les membres de l’organisation, une seule fois, et personne d’autre', async () => {
    const { announceDeploymentStatus } = await import('@/lib/deployment-events')
    const { prisma } = await import('@/lib/prisma')
    const args = { organizationId: orgId, projectId, projectName: 'Démo', deploymentId, status: 'failed' }
    await announceDeploymentStatus(args)
    await announceDeploymentStatus(args) // deux chemins constatent le même changement
    const rows = await prisma.notification.findMany({ where: { dedupeKey: `deployment:${deploymentId}:failed` } })
    expect(rows.map((r) => r.userId).sort()).toEqual([owner, member].sort())
    expect(rows.every((r) => r.href === `/dashboard/projects/${projectId}` && r.type === 'deployment.failed')).toBe(true)
    expect(rows.some((r) => r.userId === outsider)).toBe(false)
    expect(rows[0]!.body).toMatch(/journaux/i) // dit quoi faire
  })

  it('les états non finals ne notifient pas', async () => {
    const { announceDeploymentStatus } = await import('@/lib/deployment-events')
    const { prisma } = await import('@/lib/prisma')
    await announceDeploymentStatus({ organizationId: orgId, projectId, projectName: 'Démo', deploymentId, status: 'building' })
    expect(await prisma.notification.count({ where: { dedupeKey: `deployment:${deploymentId}:building` } })).toBe(0)
  })
})
