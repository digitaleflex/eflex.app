import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Intégration : actif avec EFLEX_TEST_DB=1 et une base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

// Aucune file Redis dans les tests : on capture ce que le worker aurait reçu.
const queueState = vi.hoisted(() => ({ enqueued: [] as Array<{ id: string; options: unknown }> }))
vi.mock('@/lib/queue', () => ({
  enqueueDeployment: async (id: string, options: unknown) => {
    queueState.enqueued.push({ id, options })
  },
  removeQueuedDeployment: async () => 'missing',
}))
// L'audit et les événements écrivent en base ; on ne teste ici que l'entrée d'audit.
vi.mock('@/lib/event-bus', () => ({ publish: async () => undefined }))

run('POST /api/projects/[id]/deployments/[deploymentId]/rollback', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.ENV_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64')

  const stamp = `${Date.now()}`
  const sha = (seed: string) => seed.repeat(40).slice(0, 40)

  type Person = { id: string; email: string }
  type Org = { id: string }

  let prisma: typeof import('@/lib/prisma').prisma
  let owner: Person
  let member: Person
  let outsider: Person

  let successOrg: Org
  let successProjectId = ''
  let liveDeploymentId = ''

  let memberOrg: Org
  let memberProjectId = ''
  let memberDeploymentId = ''

  let outsiderOrg: Org
  let outsiderProjectId = ''
  let memberDeploymentOfOtherOrgId = ''

  let invalidProjectId = ''
  let invalidDeploymentId = ''

  let failedProjectId = ''
  let failedDeploymentId = ''

  let busyProjectId = ''
  let busyDeploymentId = ''

  const asUser = (user: Person | null, activeOrganizationId: string | null) => {
    currentSession = user
      ? { user: { id: user.id, email: user.email }, session: { activeOrganizationId } }
      : null
  }

  const rollback = async (projectId: string, deploymentId: string) => {
    const { POST } = await import('./route')
    return POST(
      new Request(
        `http://localhost/api/projects/${projectId}/deployments/${deploymentId}/rollback`,
        { method: 'POST' },
      ),
      { params: Promise.resolve({ id: projectId, deploymentId }) },
    )
  }

  const makeUser = async (label: string): Promise<Person> =>
    prisma.user.create({ data: { name: label, email: `${label}-${stamp}@exemple.fr` } })

  const makeOrg = async (label: string): Promise<Org> =>
    prisma.organization.create({ data: { name: label, slug: `${label}-${stamp}` } })

  const makeProject = async (organizationId: string, userId: string, label: string) =>
    prisma.project.create({
      data: {
        organizationId,
        userId,
        name: label,
        slug: `${label}-${stamp}`,
        repoUrl: 'https://github.com/exemple/projet',
        framework: 'node',
      },
      select: { id: true },
    })

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma

    ;[owner, member, outsider] = await Promise.all([
      makeUser('rb-owner'),
      makeUser('rb-member'),
      makeUser('rb-outsider'),
    ])
    ;[successOrg, memberOrg, outsiderOrg] = await Promise.all([
      makeOrg('rb-success'),
      makeOrg('rb-member'),
      makeOrg('rb-outsider'),
    ])

    await Promise.all([
      prisma.member.create({ data: { organizationId: successOrg.id, userId: owner.id, role: 'owner' } }),
      prisma.member.create({ data: { organizationId: memberOrg.id, userId: member.id, role: 'member' } }),
      prisma.member.create({ data: { organizationId: outsiderOrg.id, userId: outsider.id, role: 'owner' } }),
    ])

    // 1. Cas nominal : owner, déploiement réussi.
    const successProject = await makeProject(successOrg.id, owner.id, 'rb-succes')
    successProjectId = successProject.id
    liveDeploymentId = (
      await prisma.deployment.create({
        data: { projectId: successProjectId, status: 'live', commitSha: sha('a') },
        select: { id: true },
      })
    ).id

    // 2. Simple membre : authentifié mais sans droit de déployer.
    const memberProject = await makeProject(memberOrg.id, member.id, 'rb-membre')
    memberProjectId = memberProject.id
    memberDeploymentId = (
      await prisma.deployment.create({
        data: { projectId: memberProjectId, status: 'live', commitSha: sha('b') },
        select: { id: true },
      })
    ).id

    // 3. Autre organisation : le déploiement ne doit pas être visible.
    const outsiderProject = await makeProject(outsiderOrg.id, outsider.id, 'rb-autre')
    outsiderProjectId = outsiderProject.id
    await prisma.deployment.create({
      data: { projectId: outsiderProjectId, status: 'live', commitSha: sha('c') },
    })
    // Déploiement de l'organisation « membre », visé par l'owner de l'autre organisation.
    memberDeploymentOfOtherOrgId = (
      await prisma.deployment.create({
        data: { projectId: memberProjectId, status: 'live', commitSha: sha('d') },
        select: { id: true },
      })
    ).id

    // 4. Cible sans commit complet (« pending »).
    const invalidProject = await makeProject(successOrg.id, owner.id, 'rb-invalide')
    invalidProjectId = invalidProject.id
    invalidDeploymentId = (
      await prisma.deployment.create({
        data: { projectId: invalidProjectId, status: 'live', commitSha: 'pending' },
        select: { id: true },
      })
    ).id

    // 5. Cible en échec.
    const failedProject = await makeProject(successOrg.id, owner.id, 'rb-echec')
    failedProjectId = failedProject.id
    failedDeploymentId = (
      await prisma.deployment.create({
        data: { projectId: failedProjectId, status: 'failed', commitSha: sha('e') },
        select: { id: true },
      })
    ).id

    // 6. Déploiement déjà actif sur le projet.
    const busyProject = await makeProject(successOrg.id, owner.id, 'rb-occupe')
    busyProjectId = busyProject.id
    busyDeploymentId = (
      await prisma.deployment.create({
        data: { projectId: busyProjectId, status: 'live', commitSha: sha('f') },
        select: { id: true },
      })
    ).id
    await prisma.deployment.create({
      data: { projectId: busyProjectId, status: 'building', commitSha: sha('1') },
    })
  })

  afterAll(() => {
    asUser(null, null)
  })

  it('rejette une requête non authentifiée', async () => {
    asUser(null, null)
    const response = await rollback(successProjectId, liveDeploymentId)
    expect(response.status).toBe(401)
  })

  it('interdit à un simple membre de revenir à une version précédente', async () => {
    asUser(member, memberOrg.id)
    const response = await rollback(memberProjectId, memberDeploymentId)
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/rôle/i)
  })

  it('renvoie 404 pour un déploiement d’une autre organisation', async () => {
    asUser(outsider, outsiderOrg.id)
    const response = await rollback(memberProjectId, memberDeploymentOfOtherOrgId)
    expect(response.status).toBe(404)
  })

  it('refuse un déploiement sans identifiant de commit complet', async () => {
    asUser(owner, successOrg.id)
    const response = await rollback(invalidProjectId, invalidDeploymentId)
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalid_commit')
  })

  it('refuse un déploiement qui n’est pas en ligne', async () => {
    asUser(owner, successOrg.id)
    const response = await rollback(failedProjectId, failedDeploymentId)
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('not_live')
  })

  it('refuse (409) quand un déploiement est déjà actif', async () => {
    asUser(owner, successOrg.id)
    const response = await rollback(busyProjectId, busyDeploymentId)
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe('deployment_in_progress')
    // Aucun déploiement n'a été créé puis annulé pour ce cas.
    expect(await prisma.deployment.count({ where: { projectId: busyProjectId } })).toBe(2)
  })

  it('met en file un retour arrière sur le commit cible et l’audite', async () => {
    asUser(owner, successOrg.id)
    const before = await prisma.deployment.count({ where: { projectId: successProjectId } })

    const response = await rollback(successProjectId, liveDeploymentId)
    expect(response.status).toBe(202)
    const body = await response.json()
    expect(body.rollback).toMatchObject({ commitSha: sha('a'), targetDeploymentId: liveDeploymentId })

    const created = await prisma.deployment.findUnique({ where: { id: body.deployment.id } })
    expect(created).toMatchObject({ projectId: successProjectId, commitSha: sha('a'), status: 'queued' })
    expect(await prisma.deployment.count({ where: { projectId: successProjectId } })).toBe(before + 1)

    // Le worker reçoit l'intention de retour arrière avec le job.
    const enqueued = queueState.enqueued.find((item) => item.id === body.deployment.id)
    expect(enqueued?.options).toEqual({ rollback: true })

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'deployment.rollback', targetId: body.deployment.id },
    })
    expect(entry).not.toBeNull()
    expect(entry).toMatchObject({ actorId: owner.id, targetType: 'deployment' })
    expect(entry?.details).toMatchObject({
      projectId: successProjectId,
      sourceDeploymentId: liveDeploymentId,
      sourceCommitSha: sha('a'),
    })
  })
})
