import type { Project, ProjectDatabase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'
import {
  createManagedDatabase,
  deleteManagedDatabase,
  getManagedDatabase,
  managedDatabaseAction,
  type ManagedDatabaseKind,
} from '@/lib/coolify'
import { enqueueProjectDeployment } from '@/lib/project-deployments'

export const DATABASE_KINDS = {
  postgresql: {
    label: 'PostgreSQL',
    envKey: 'DATABASE_URL',
    description: 'Base relationnelle privée pour votre application.',
  },
  redis: {
    label: 'Redis',
    envKey: 'REDIS_URL',
    description: 'Cache et files de travail privés pour votre application.',
  },
} as const

export function isDatabaseKind(value: unknown): value is ManagedDatabaseKind {
  return value === 'postgresql' || value === 'redis'
}

const internalAad = (projectId: string, kind: string) => `project-db:${projectId}:${kind}`
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Attend que Coolify ait démarré la base (création asynchrone). */
async function waitUntilReady(id: string): Promise<{ status: string; internalUrl: string }> {
  let status = 'creating'
  let internalUrl = ''
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const info = await getManagedDatabase(id)
    if (!('error' in info)) {
      status = info.status
      if (info.internalUrl) internalUrl = info.internalUrl
      if (status.startsWith('running')) return { status, internalUrl }
      if (status.startsWith('exited')) return { status, internalUrl }
    }
    await delay(2_000)
  }
  return { status, internalUrl }
}

/** Crée la base, stocke son URL chiffrée et injecte la variable d'environnement. */
export async function createProjectDatabase(
  project: Pick<Project, 'id' | 'slug' | 'name' | 'organizationId' | 'coolifyAppId'>,
  kind: ManagedDatabaseKind,
): Promise<{ database: ProjectDatabase; deploymentId: string | null; ready: boolean } | { error: string; status: number }> {
  const config = DATABASE_KINDS[kind]
  const existing = await prisma.projectDatabase.findUnique({
    where: { projectId_kind: { projectId: project.id, kind } },
    select: { id: true },
  })
  if (existing) {
    return { error: `Une base ${config.label} existe déjà pour ce projet.`, status: 409 }
  }
  const envExists = await prisma.envVar.findUnique({
    where: { projectId_key: { projectId: project.id, key: config.envKey } },
    select: { key: true },
  })
  if (envExists) {
    return {
      error: `La variable ${config.envKey} existe déjà. Supprimez-la ou utilisez votre propre base.`,
      status: 409,
    }
  }

  const created = await createManagedDatabase(kind, `eflex-${project.slug}-${kind}`)
  if ('error' in created) return { error: created.error, status: 502 }
  if (!created.internalUrl) {
    return { error: "L'hébergement n'a pas renvoyé l'URL interne de la base.", status: 502 }
  }

  const started = await waitUntilReady(created.id)
  const internalUrl = started.internalUrl || created.internalUrl
  const ready = started.status.startsWith('running')

  try {
    const database = await prisma.$transaction(async (tx) => {
      const row = await tx.projectDatabase.create({
        data: {
          projectId: project.id,
          kind,
          coolifyId: created.id,
          name: created.name,
          status: started.status,
          internalUrl: encrypt(internalUrl, internalAad(project.id, kind)),
        },
      })
      await tx.envVar.create({
        data: {
          projectId: project.id,
          key: config.envKey,
          value: encrypt(internalUrl, `${project.id}:${config.envKey}`),
        },
      })
      return row
    })

    let deploymentId: string | null = null
    if (project.coolifyAppId && ready) {
      const queued = await enqueueProjectDeployment(project)
      if (!('error' in queued)) deploymentId = queued.deploymentId
    }
    return { database, deploymentId, ready }
  } catch (error) {
    // La base est créée côté infrastructure : on la supprime pour ne pas laisser
    // de ressource orpheline si l'enregistrement local échoue.
    await deleteManagedDatabase(created.id).catch(() => undefined)
    console.error('[databases] enregistrement impossible', error)
    return { error: "La base a été créée mais n'a pas pu être enregistrée. Réessayez.", status: 500 }
  }
}

/** Supprime la base et la variable d'environnement associée. */
export async function deleteProjectDatabase(
  project: Pick<Project, 'id' | 'slug' | 'name' | 'organizationId' | 'coolifyAppId'>,
  database: Pick<ProjectDatabase, 'id' | 'kind' | 'coolifyId'>,
): Promise<{ deploymentId: string | null } | { error: string; status: number }> {
  const deleted = await deleteManagedDatabase(database.coolifyId)
  if ('error' in deleted) return { error: deleted.error, status: 502 }

  const config = DATABASE_KINDS[database.kind as ManagedDatabaseKind]
  await prisma.$transaction(async (tx) => {
    await tx.projectDatabase.delete({ where: { id: database.id } })
    if (config) {
      await tx.envVar.deleteMany({ where: { projectId: project.id, key: config.envKey } })
    }
  })

  let deploymentId: string | null = null
  if (project.coolifyAppId) {
    const queued = await enqueueProjectDeployment(project)
    if (!('error' in queued)) deploymentId = queued.deploymentId
  }
  return { deploymentId }
}

/** Rafraîchit le statut depuis Coolify et met à jour l'URL si elle a changé. */
export async function refreshProjectDatabase(
  database: Pick<ProjectDatabase, 'id' | 'projectId' | 'kind' | 'coolifyId' | 'internalUrl'>,
): Promise<{ status: string; internalUrl: string } | { error: string }> {
  const info = await getManagedDatabase(database.coolifyId)
  if ('error' in info) return { error: info.error }

  const current = readInternalUrl(database)
  if (info.internalUrl && current !== info.internalUrl) {
    const aad = internalAad(database.projectId, database.kind)
    await prisma.projectDatabase.update({
      where: { id: database.id },
      data: {
        status: info.status,
        internalUrl: encrypt(info.internalUrl, aad),
      },
    })
    const envKey = DATABASE_KINDS[database.kind as ManagedDatabaseKind]?.envKey
    if (envKey) {
      await prisma.envVar.updateMany({
        where: { projectId: database.projectId, key: envKey },
        data: { value: encrypt(info.internalUrl, `${database.projectId}:${envKey}`) },
      })
    }
  } else {
    await prisma.projectDatabase.update({ where: { id: database.id }, data: { status: info.status } })
  }
  return { status: info.status, internalUrl: info.internalUrl }
}

/** Démarre, arrête ou redémarre la base managée. */
export async function projectDatabaseAction(
  database: Pick<ProjectDatabase, 'id' | 'coolifyId'>,
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: true } | { error: string }> {
  const result = await managedDatabaseAction(database.coolifyId, action)
  if ('error' in result) return result
  await prisma.projectDatabase.update({ where: { id: database.id }, data: { status: action === 'stop' ? 'stopped' : 'restarting' } })
  return { ok: true }
}

/** Déchiffre l'URL interne (usage serveur uniquement, jamais renvoyée au client). */
export function readInternalUrl(database: Pick<ProjectDatabase, 'projectId' | 'kind' | 'internalUrl'>): string | null {
  try {
    return decrypt(database.internalUrl, internalAad(database.projectId, database.kind))
  } catch {
    return null
  }
}
