import { inOrganizationNetwork } from '@/lib/org-network'
import type { Project, ProjectDatabase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'
import type { ManagedDatabaseKind } from '@/lib/coolify'
import { backupSupported, ensureDatabaseBackup } from '@/lib/database-backups'
import {
  DATABASE_ENGINE_CATALOG,
  getDatabaseEngineCapabilities,
  isManagedDatabaseKind,
  learnDatabaseEngineCapability,
  listDatabaseEngineCapabilities,
  type DatabaseEngineCapabilities,
} from '@/lib/database-capabilities'
import { getProviderForStoredKind, resolveDatabaseProvider, type DatabaseProvider } from '@/lib/database-provider'
import { enqueueProjectDeployment } from '@/lib/project-deployments'
import { isAppDeployed } from '@/lib/project-primary'

type DeployableProject = Pick<Project, 'id' | 'slug' | 'name' | 'organizationId' | 'coolifyAppId'> & {
  apps?: ReadonlyArray<{ coolifyAppId?: string | null }>
}

/** Catalogue des moteurs (compatibilité API existante). Source : registre de capacités. */
export const DATABASE_KINDS = Object.fromEntries(
  DATABASE_ENGINE_CATALOG.map((entry) => [
    entry.kind,
    { label: entry.label, envKey: entry.envKey, envAliases: entry.envAliases, description: entry.description },
  ]),
) as Record<ManagedDatabaseKind, { label: string; envKey: string; envAliases: string[]; description: string }>

export function isDatabaseKind(value: unknown): value is ManagedDatabaseKind {
  return isManagedDatabaseKind(value)
}

export async function listManagedDatabaseCatalog() {
  return listDatabaseEngineCapabilities()
}

export async function getManagedDatabaseCapabilities(kind: ManagedDatabaseKind) {
  return getDatabaseEngineCapabilities(kind)
}

/**
 * Quota de bases managées par projet (#184). Par défaut 5 (une par moteur possible de façon raisonnable
 * sans duplication), borné pour éviter les abus ; surchargeable via EFLEX_MAX_DATABASES_PER_PROJECT.
 */
export function maxDatabasesPerProject(): number {
  const raw = Number.parseInt(process.env.EFLEX_MAX_DATABASES_PER_PROJECT ?? '', 10)
  if (Number.isFinite(raw)) return Math.min(20, Math.max(1, raw))
  return 5
}

const internalAad = (projectId: string, kind: string) => `project-db:${projectId}:${kind}`
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function managedKeys(kind: ManagedDatabaseKind): { primary: string; aliases: string[]; all: string[] } {
  const entry = DATABASE_KINDS[kind]
  const aliases = entry?.envAliases ?? []
  const primary = entry?.envKey ?? kind.toUpperCase()
  return { primary, aliases, all: [primary, ...aliases] }
}

function decryptEnvValue(projectId: string, key: string, value: string): string | null {
  try {
    return decrypt(value, `${projectId}:${key}`)
  } catch {
    return null
  }
}

/** Identifie les variables d’environnement gérées par cette base (URL identique), sans toucher aux vars utilisateur. */
async function managedEnvKeysForDatabase(
  database: Pick<ProjectDatabase, 'projectId' | 'kind' | 'internalUrl'>,
): Promise<string[]> {
  if (!isDatabaseKind(database.kind)) return []
  const url = readInternalUrl(database)
  if (!url) return [managedKeys(database.kind).primary]
  const keys = managedKeys(database.kind).all
  const vars = await prisma.envVar.findMany({
    where: { projectId: database.projectId, key: { in: keys }, appId: null },
    select: { key: true, value: true },
  })
  return vars.filter((v) => decryptEnvValue(database.projectId, v.key, v.value) === url).map((v) => v.key)
}

async function providerForKind(
  kind: ManagedDatabaseKind,
): Promise<
  | { ok: true; provider: DatabaseProvider; capabilities: DatabaseEngineCapabilities }
  | { ok: false; error: string; status: number }
> {
  const resolved = await resolveDatabaseProvider(kind)
  if ('error' in resolved) return { ok: false, error: resolved.error, status: 400 }
  if (!resolved.capabilities.provisionSupported || !resolved.capabilities.lifecycleSupported) {
    return {
      ok: false,
      error:
        resolved.capabilities.reason ??
        `Le moteur ${resolved.capabilities.label} n’est pas disponible sur cette instance.`,
      status: 400,
    }
  }
  return { ok: true, provider: resolved.provider, capabilities: resolved.capabilities }
}

/** Attend que le provider ait démarré la base (création asynchrone). */
async function waitUntilReady(
  provider: { getManagedDatabase: (id: string) => Promise<{ status: string; internalUrl: string } | { error: string }> },
  id: string,
): Promise<{ status: string; internalUrl: string }> {
  let status = 'creating'
  let internalUrl = ''
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const info = await provider.getManagedDatabase(id)
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

/** Crée la base, stocke son URL chiffrée et injecte la variable d'environnement (et alias compatibles si libres). */
export async function createProjectDatabase(
  project: DeployableProject,
  kind: ManagedDatabaseKind,
): Promise<{ database: ProjectDatabase; deploymentId: string | null; ready: boolean } | { error: string; status: number }> {
  const selection = await providerForKind(kind)
  if (!selection.ok) return { error: selection.error, status: selection.status }
  const provider = selection.provider
  const config = DATABASE_KINDS[kind]
  const keys = managedKeys(kind)

  const existing = await prisma.projectDatabase.findUnique({
    where: { projectId_kind: { projectId: project.id, kind } },
    select: { id: true },
  })
  if (existing) {
    return { error: `Une base ${config.label} existe déjà pour ce projet.`, status: 409 }
  }

  const count = await prisma.projectDatabase.count({ where: { projectId: project.id } })
  const limit = maxDatabasesPerProject()
  if (count >= limit) {
    return {
      error: `Limite atteinte : ${limit} base(s) managée(s) maximum par projet. Supprimez une base existante avant d’en créer une nouvelle.`,
      status: 409,
    }
  }

  const primaryEnvExists = await prisma.envVar.findUnique({
    where: { projectId_key: { projectId: project.id, key: keys.primary } },
    select: { key: true },
  })
  if (primaryEnvExists) {
    return {
      error: `La variable ${keys.primary} existe déjà. Supprimez-la ou utilisez votre propre base.`,
      status: 409,
    }
  }

  const created = await inOrganizationNetwork(project.organizationId, () =>
    provider.createManagedDatabase(kind, `eflex-${project.slug}-${kind}`),
  )
  if ('error' in created) {
    // Apprentissage réactif (#183) : un refus explicite de l'instance invalide le provisionnement en cache.
    if (/H[ée]bergement API (404|405)\b/i.test(created.error) || /not found|not supported|unsupported/i.test(created.error)) {
      learnDatabaseEngineCapability(kind, {
        operation: 'provision',
        supported: false,
        reason: `Le moteur ${config.label} n’est pas supporté ou provisionnable par cette instance/provider.`,
      })
    }
    return { error: created.error, status: 502 }
  }
  if (!created.internalUrl) {
    return { error: "L'hébergement n'a pas renvoyé l'URL interne de la base.", status: 502 }
  }

  const started = await waitUntilReady(provider, created.id)
  const internalUrl = started.internalUrl || created.internalUrl
  const ready = started.status.startsWith('running')

  try {
    const existingKeys = await prisma.envVar.findMany({
      where: { projectId: project.id, key: { in: keys.all }, appId: null },
      select: { key: true },
    })
    const taken = new Set(existingKeys.map((v) => v.key))
    const keysToCreate = keys.all.filter((k) => !taken.has(k))

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
      for (const key of keysToCreate) {
        await tx.envVar.create({
          data: {
            projectId: project.id,
            key,
            value: encrypt(internalUrl, `${project.id}:${key}`),
          },
        })
      }
      return row
    })

    if (await backupSupported(kind)) {
      const backup = await ensureDatabaseBackup(database).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error),
      }))
      if ('error' in backup) console.error('[databases] sauvegarde non planifiée', database.id, backup.error)
    }

    let deploymentId: string | null = null
    if (isAppDeployed(project) && ready) {
      const queued = await enqueueProjectDeployment(project)
      if (!('error' in queued)) deploymentId = queued.deploymentId
    }
    return { database, deploymentId, ready }
  } catch (error) {
    await provider.deleteManagedDatabase(created.id).catch(() => undefined)
    console.error('[databases] enregistrement impossible', error)
    return { error: "La base a été créée mais n'a pas pu être enregistrée. Réessayez.", status: 500 }
  }
}

function providerForStoredDatabase(kind: string) {
  if (!isDatabaseKind(kind)) return null
  return getProviderForStoredKind(kind)
}

/** Supprime la base et les variables d'environnement gérées (principale + alias) associées. */
export async function deleteProjectDatabase(
  project: DeployableProject,
  database: Pick<ProjectDatabase, 'id' | 'projectId' | 'kind' | 'coolifyId' | 'internalUrl'>,
): Promise<{ deploymentId: string | null } | { error: string; status: number }> {
  const provider = providerForStoredDatabase(database.kind) ?? getProviderForStoredKind('postgresql')
  const keysToDelete = await managedEnvKeysForDatabase(database).catch(() => {
    const primary = isDatabaseKind(database.kind) ? managedKeys(database.kind).primary : null
    return primary ? [primary] : []
  })

  const deleted = await provider.deleteManagedDatabase(database.coolifyId)
  if ('error' in deleted) return { error: deleted.error, status: 502 }

  await prisma.$transaction(async (tx) => {
    await tx.projectDatabase.delete({ where: { id: database.id } })
    if (keysToDelete.length > 0) {
      await tx.envVar.deleteMany({ where: { projectId: project.id, key: { in: keysToDelete }, appId: null } })
    }
  })

  let deploymentId: string | null = null
  if (isAppDeployed(project)) {
    const queued = await enqueueProjectDeployment(project)
    if (!('error' in queued)) deploymentId = queued.deploymentId
  }
  return { deploymentId }
}

/** Rafraîchit le statut depuis le provider et met à jour l'URL (et alias gérés) si elle a changé. */
export async function refreshProjectDatabase(
  database: Pick<ProjectDatabase, 'id' | 'projectId' | 'kind' | 'coolifyId' | 'internalUrl'>,
): Promise<{ status: string; internalUrl: string } | { error: string }> {
  const provider = providerForStoredDatabase(database.kind) ?? getProviderForStoredKind('postgresql')
  const info = await provider.getManagedDatabase(database.coolifyId)
  if ('error' in info) return { error: info.error }

  const current = readInternalUrl(database)
  const targetUrl = info.internalUrl || current

  if (info.internalUrl && current !== info.internalUrl) {
    const aad = internalAad(database.projectId, database.kind)
    await prisma.projectDatabase.update({
      where: { id: database.id },
      data: {
        status: info.status,
        internalUrl: encrypt(info.internalUrl, aad),
      },
    })
  } else {
    await prisma.projectDatabase.update({ where: { id: database.id }, data: { status: info.status } })
  }

  // Réconciliation opportuniste : maintient la variable principale et ajoute les alias compatibles
  // libres pour les bases existantes, sans écraser de variables utilisateur ni toucher aux clés
  // déjà utilisées pour une autre valeur.
  if (targetUrl && isDatabaseKind(database.kind)) {
    const keys = managedKeys(database.kind)
    const vars = await prisma.envVar.findMany({
      where: { projectId: database.projectId, key: { in: keys.all }, appId: null },
      select: { key: true, value: true },
    })
    const existing = new Map(vars.map((v) => [v.key, v.value]))
    const managed = vars
      .filter((v) => {
        const plain = decryptEnvValue(database.projectId, v.key, v.value)
        return plain === targetUrl || (current ? plain === current : false)
      })
      .map((v) => v.key)

    const toUpsert = new Set<string>(managed)
    // Réconcilie la variable principale si elle est gérée par cette base ou absente.
    if (!existing.has(keys.primary) || managed.includes(keys.primary)) toUpsert.add(keys.primary)
    // N'ajoute un alias que s'il est libre (ou déjà géré par cette base).
    for (const key of keys.aliases) {
      if (!existing.has(key) || managed.includes(key)) toUpsert.add(key)
    }

    for (const key of toUpsert) {
      const value = encrypt(targetUrl, `${database.projectId}:${key}`)
      await prisma.envVar.upsert({
        where: { projectId_key: { projectId: database.projectId, key } },
        update: { value },
        create: { projectId: database.projectId, key, value },
      })
    }
  }
  return { status: info.status, internalUrl: info.internalUrl }
}

/** Démarre, arrête ou redémarre la base managée. */
export async function projectDatabaseAction(
  database: Pick<ProjectDatabase, 'id' | 'kind' | 'coolifyId'>,
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: true } | { error: string }> {
  const provider = providerForStoredDatabase(database.kind) ?? getProviderForStoredKind('postgresql')
  const result = await provider.managedDatabaseAction(database.coolifyId, action)
  if ('error' in result) return result
  await prisma.projectDatabase.update({
    where: { id: database.id },
    data: { status: action === 'stop' ? 'stopped' : 'restarting' },
  })
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
