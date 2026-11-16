import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Intégration : EFLEX_TEST_DB=1 + base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

const coolify = vi.hoisted(() => ({
  schedules: new Map<string, Array<{ id: string; frequency: string; enabled: boolean; saveS3: boolean; executions: unknown[] }>>(),
  created: [] as Array<{ databaseId: string; options: unknown }>,
  failCreate: false,
  imports: [] as Array<{ databaseId: string; source: unknown }>,
}))

vi.mock('@/lib/coolify', () => ({
  listDatabaseBackups: async (databaseId: string) => coolify.schedules.get(databaseId) ?? [],
  createDatabaseBackup: async (databaseId: string, options: unknown) => {
    if (coolify.failCreate) return { error: 'Hébergement API 404' }
    coolify.created.push({ databaseId, options })
    const id = `sched-${databaseId}`
    coolify.schedules.set(databaseId, [{ id, frequency: '0 2 * * *', enabled: true, saveS3: true, executions: [] }])
    return { id }
  },
  runDatabaseBackup: async () => ({ ok: true }),
  startDatabaseImport: async (databaseId: string, source: unknown) => {
    coolify.imports.push({ databaseId, source })
    return { id: '99' }
  },
  getDatabaseImportStatus: async () => ({ state: 'finished', finishedAt: null }),
}))

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
let prisma: typeof import('@/lib/prisma').prisma
let backups: typeof import('@/lib/database-backups')
const created: { users: string[]; orgs: string[] } = { users: [], orgs: [] }

async function fixture(kind = 'postgresql') {
  const seq = Math.random().toString(36).slice(2, 8)
  const user = await prisma.user.create({ data: { name: 'Owner', email: `backup-${stamp}-${seq}@exemple.fr` } })
  const organization = await prisma.organization.create({
    data: { name: 'Org sauvegarde', slug: `org-backup-${stamp}-${seq}`, members: { create: { userId: user.id, role: 'owner' } } },
  })
  created.users.push(user.id)
  created.orgs.push(organization.id)
  const project = await prisma.project.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      name: 'Boutique',
      slug: `backup-${stamp}-${seq}`,
      repoUrl: 'https://github.com/exemple/boutique',
      framework: 'nextjs',
      domain: `backup-${stamp}-${seq}.eflex.app`,
      plan: { framework: 'nextjs', port: 3000, root: '' },
    },
  })
  const database = await prisma.projectDatabase.create({
    data: { projectId: project.id, kind, coolifyId: `coolify-db-${stamp}-${seq}`, name: 'db', internalUrl: 'v1:x' },
  })
  return { user, organization, project, database }
}

run('sauvegardes des bases (intégration)', () => {
  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
    backups = await import('@/lib/database-backups')
  })

  beforeEach(() => {
    coolify.schedules.clear()
    coolify.created.length = 0
    coolify.failCreate = false
    coolify.imports.length = 0
  })

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } })
    await prisma.project.deleteMany({ where: { organizationId: { in: created.orgs } } })
    await prisma.organization.deleteMany({ where: { id: { in: created.orgs } } })
    await prisma.user.deleteMany({ where: { id: { in: created.users } } })
  })

  it('planifie une fois, puis reste idempotent', async () => {
    const { database } = await fixture()
    const settings = backups.backupSettings({ COOLIFY_BACKUP_S3_STORAGE_UUID: 's3-1' })
    const first = await backups.ensureDatabaseBackup(database, settings)
    expect(first).toEqual({ backupId: `sched-${database.coolifyId}`, created: true })
    const stored = await prisma.projectDatabase.findUniqueOrThrow({ where: { id: database.id } })
    expect(stored.backupId).toBe(`sched-${database.coolifyId}`)
    expect(stored.backupScheduledAt).toBeInstanceOf(Date)

    const second = await backups.ensureDatabaseBackup(stored, settings)
    expect(second).toEqual({ backupId: stored.backupId, created: false })
    expect(coolify.created).toHaveLength(1)
    expect(coolify.created[0]?.options).toMatchObject({ s3StorageUuid: 's3-1' })
  })

  it('reprend une planification déjà présente dans Coolify au lieu d’en créer une autre', async () => {
    const { database } = await fixture()
    coolify.schedules.set(database.coolifyId, [{ id: 'manuelle', frequency: 'daily', enabled: true, saveS3: false, executions: [] }])
    const result = await backups.ensureDatabaseBackup(database)
    expect(result).toEqual({ backupId: 'manuelle', created: false })
    expect(coolify.created).toHaveLength(0)
  })

  it('refuse Redis et ne touche pas la base en cas d’erreur de l’hébergement', async () => {
    const redis = await fixture('redis')
    expect(await backups.ensureDatabaseBackup(redis.database)).toEqual({
      error: 'Les sauvegardes ne sont disponibles que pour PostgreSQL.',
    })
    const pg = await fixture()
    coolify.failCreate = true
    expect(await backups.ensureDatabaseBackup(pg.database)).toEqual({ error: 'Hébergement API 404' })
    const stored = await prisma.projectDatabase.findUniqueOrThrow({ where: { id: pg.database.id } })
    expect(stored.backupId).toBeNull()
  })

  it('la passe de surveillance planifie les anciennes bases et alerte une seule fois par jour sur un échec', async () => {
    const { database, user } = await fixture()
    const now = new Date('2026-11-16T12:00:00Z')
    await backups.evaluateDatabaseBackups(now)
    const scheduled = await prisma.projectDatabase.findUniqueOrThrow({ where: { id: database.id } })
    expect(scheduled.backupId).toBe(`sched-${database.coolifyId}`)
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'database.backup_failed' } })).toBe(0)

    coolify.schedules.set(database.coolifyId, [
      {
        id: scheduled.backupId!,
        frequency: '0 2 * * *',
        enabled: true,
        saveS3: true,
        executions: [{ id: 'e1', status: 'failed', size: null, createdAt: '2026-11-16T02:00:00Z' }],
      },
    ])
    await backups.evaluateDatabaseBackups(now)
    await backups.evaluateDatabaseBackups(now)
    const notifications = await prisma.notification.findMany({ where: { userId: user.id, type: 'database.backup_failed' } })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.title).toBe('Sauvegarde en défaut : Boutique')
    expect(notifications[0]?.href).toMatch(/^\/dashboard\/projects\/.+\/settings$/)
  })

  it('ne restaure qu’une sauvegarde réussie de cette même base', async () => {
    const { database } = await fixture()
    const other = await fixture()
    const file = (id: string) => `/data/coolify/backups/databases/t-0/${id}/pg.dmp`
    coolify.schedules.set(database.coolifyId, [
      {
        id: 'sched',
        frequency: 'daily',
        enabled: true,
        saveS3: true,
        executions: [
          { id: 'ok', status: 'success', size: 1, createdAt: '2026-11-16T02:00:00Z', filename: file('a'), localDeleted: true, s3Uploaded: true },
          { id: 'ko', status: 'failed', size: null, createdAt: '2026-11-15T02:00:00Z', filename: null, localDeleted: false, s3Uploaded: false },
        ],
      },
    ])
    coolify.schedules.set(other.database.coolifyId, [
      {
        id: 'sched-b',
        frequency: 'daily',
        enabled: true,
        saveS3: false,
        executions: [{ id: 'autre', status: 'success', size: 1, createdAt: '2026-11-16T02:00:00Z', filename: file('b'), localDeleted: false, s3Uploaded: false }],
      },
    ])
    const settings = backups.backupSettings({ COOLIFY_BACKUP_S3_STORAGE_UUID: 's3-1' })

    // L'exécution d'une autre base est introuvable depuis celle-ci.
    expect(await backups.restoreDatabaseBackup(database, 'autre', settings)).toEqual({ error: 'Sauvegarde introuvable.', status: 404 })
    expect((await backups.restoreDatabaseBackup(database, 'ko', settings)) as { status: number }).toMatchObject({ status: 409 })
    expect(coolify.imports).toHaveLength(0)

    const result = await backups.restoreDatabaseBackup(database, 'ok', settings)
    expect(result).toEqual({ importId: '99', backupCreatedAt: '2026-11-16T02:00:00Z' })
    expect(coolify.imports).toEqual([
      { databaseId: database.coolifyId, source: { source: 's3', s3StorageUuid: 's3-1', path: file('a') } },
    ])

    const status = await backups.getDatabaseBackupStatus({ ...database, backupId: 'sched' }, new Date('2026-11-16T12:00:00Z'), settings)
    expect(JSON.stringify(status)).not.toContain('/data/')
    expect(status.summary?.recent.map((item) => [item.id, item.restorable])).toEqual([['ok', true], ['ko', false]])
  })
})
