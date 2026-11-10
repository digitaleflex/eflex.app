import { afterAll, describe, expect, it } from 'vitest'

// Test d'intégration : actif uniquement avec EFLEX_TEST_DB=1 et une base
// PostgreSQL migrée (`npx prisma migrate deploy`). Le nom de la base doit
// contenir « test » (garde-fou `test-support/require-test-db.ts`) : jamais `eflex`.
//   EFLEX_TEST_DB=1 DATABASE_URL=postgresql://…/eflex_test \
//     pnpm vitest run portail/src/lib/project-app-backfill.integration.test.ts
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

run('backfill D2 (ProjectApp)', () => {
  const suffix = `d2-${Date.now()}`
  const ids: { userId?: string; organizationId?: string; projectId?: string } = {}

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    if (ids.projectId) await prisma.project.deleteMany({ where: { id: ids.projectId } })
    if (ids.organizationId) await prisma.organization.deleteMany({ where: { id: ids.organizationId } })
    if (ids.userId) await prisma.user.deleteMany({ where: { id: ids.userId } })
    await prisma.$disconnect()
  })

  it('crée une application, rattache les déploiements et reste idempotent', async () => {
    const { prisma } = await import('@/lib/prisma')
    const { runBackfill } = await import('./project-app-backfill')

    const user = await prisma.user.create({
      data: { name: 'Test D2', email: `${suffix}@exemple.fr`, emailVerified: true },
    })
    ids.userId = user.id
    const organization = await prisma.organization.create({
      data: { name: 'Test D2', slug: suffix },
    })
    ids.organizationId = organization.id

    const project = await prisma.project.create({
      data: {
        name: 'Boutique',
        slug: suffix,
        repoUrl: 'https://github.com/exemple/boutique',
        userId: user.id,
        organizationId: organization.id,
        framework: 'nextjs',
        runtime: 'node@22',
        port: 3000,
        domain: `${suffix}.eflex.app`,
        coolifyAppId: `coolify-${suffix}`,
        tlsValid: true,
        tlsCheckedAt: new Date('2026-11-01T00:00:00Z'),
        plan: { root: 'apps/web', framework: 'nextjs', port: 3000 },
      },
    })
    ids.projectId = project.id

    const deployments = await Promise.all(
      ['aaaaaaa', 'bbbbbbb'].map((commitSha) =>
        prisma.deployment.create({ data: { projectId: project.id, commitSha, status: 'live' } }),
      ),
    )
    // Variables et alias restent de portée projet : le backfill ne les touche pas.
    await prisma.envVar.create({
      data: { projectId: project.id, key: 'DATABASE_URL', value: 'v1:nonce:chiffre' },
    })
    await prisma.projectDomain.create({
      data: { projectId: project.id, hostname: `www.${suffix}.exemple.fr` },
    })

    // 1. Simulation : aucune écriture.
    const dry = await runBackfill({
      apply: false,
      batchSize: 10,
      projectIds: [project.id],
      prisma,
      log: () => undefined,
    })
    expect(dry).toMatchObject({ projects: 1, created: 1, deploymentsAttached: 2, errors: 0 })
    expect(await prisma.projectApp.count({ where: { projectId: project.id } })).toBe(0)

    // 2. Application réelle.
    const applied = await runBackfill({
      apply: true,
      batchSize: 10,
      projectIds: [project.id],
      prisma,
      log: () => undefined,
    })
    expect(applied).toMatchObject({ created: 1, deploymentsAttached: 2, errors: 0 })

    const apps = await prisma.projectApp.findMany({ where: { projectId: project.id } })
    expect(apps).toHaveLength(1)
    const app = apps[0]!
    expect(app).toMatchObject({
      name: 'web',
      root: 'apps/web',
      position: 0,
      framework: 'nextjs',
      runtime: 'node@22',
      port: 3000,
      domain: `${suffix}.eflex.app`,
      coolifyAppId: `coolify-${suffix}`,
      tlsValid: true,
    })
    expect(app.plan).toEqual({ root: 'apps/web', framework: 'nextjs', port: 3000 })

    const attached = await prisma.deployment.findMany({ where: { projectId: project.id } })
    expect(attached.map((row) => row.id).sort()).toEqual(deployments.map((row) => row.id).sort())
    expect(attached.every((row) => row.appId === app.id)).toBe(true)
    expect(attached.every((row) => row.groupId === null)).toBe(true)

    // Portée projet conservée : le worker actuel continue de voir ces lignes.
    expect(
      await prisma.envVar.count({ where: { projectId: project.id, appId: null } }),
    ).toBe(1)
    expect(
      await prisma.projectDomain.count({ where: { projectId: project.id, appId: null } }),
    ).toBe(1)

    // 3. Double exécution : aucun doublon, aucune réécriture.
    const again = await runBackfill({
      apply: true,
      batchSize: 10,
      projectIds: [project.id],
      prisma,
      log: () => undefined,
    })
    expect(again).toMatchObject({ projects: 1, created: 0, skippedExisting: 1, errors: 0 })
    expect(await prisma.projectApp.count({ where: { projectId: project.id } })).toBe(1)
  })
})
