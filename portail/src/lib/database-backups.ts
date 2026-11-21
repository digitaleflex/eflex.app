import type { ProjectDatabase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  DatabaseBackupExecution,
  DatabaseBackupSchedule,
  DatabaseImportSource,
  DatabaseImportState,
} from '@/lib/coolify'
import { getDatabaseBackupAdapter } from '@/lib/database-backup-adapters'
import {
  getDatabaseEngineCapabilities,
  getDatabaseEngineCatalog,
  isManagedDatabaseKind,
  type ManagedDatabaseKind,
} from '@/lib/database-capabilities'
import { memberIds, notify } from '@/lib/notifications'

/**
 * Sauvegardes des bases managées.
 *
 * Intégration Coolify générique (planification, exécutions, copie S3 optionnelle, restauration assistée,
 * preuve de restauration consignée) pour les moteurs exposés par le registre de capacités/adaptateurs
 * (aujourd'hui PostgreSQL, MySQL, MariaDB, MongoDB selon l'instance). Les autres moteurs ne bénéficient
 * pas d'un parcours intégré EFLEX : dégradation explicite pilotée par `database-capabilities.ts` (Redis
 * traité comme cache/file sans sauvegarde Coolify, etc.) sans généralisation implicite.
 */

/** Moteurs candidats au parcours de sauvegarde Coolify générique (filtre de surveillance). */
export const BACKUP_CANDIDATE_KINDS = ['postgresql', 'mysql', 'mariadb', 'mongodb'] as const
/** @deprecated utiliser la capacité réelle via `backupSupported()` / `database-capabilities`. */
export const BACKUP_SUPPORTED_KINDS = BACKUP_CANDIDATE_KINDS

/** Support sauvegarde intégrée EFLEX, piloté par les capacités du moteur. */
export async function backupSupported(kind: string): Promise<boolean> {
  if (!isManagedDatabaseKind(kind)) return false
  const { capabilities } = await getDatabaseEngineCapabilities(kind)
  return capabilities.backupSupported
}

export async function listBackupCandidateKinds(): Promise<ManagedDatabaseKind[]> {
  const kinds: ManagedDatabaseKind[] = []
  for (const kind of BACKUP_CANDIDATE_KINDS) {
    if (await backupSupported(kind)) kinds.push(kind)
  }
  return kinds
}

export interface BackupSettings {
  frequency: string
  s3StorageUuid?: string
  retentionLocal: number
  retentionS3: number
  /** Au-delà, la dernière sauvegarde réussie est jugée trop ancienne. */
  maxAgeHours: number
}

const FREQUENCY_KEYWORDS = new Set(['hourly', 'daily', 'weekly', 'monthly', 'yearly'])
const CRON_PATTERN = /^\S+(\s+\S+){4}$/
export const DEFAULT_BACKUP_FREQUENCY = '0 2 * * *'

function intFromEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function backupSettings(env: Record<string, string | undefined> = process.env): BackupSettings {
  const rawFrequency = env.DATABASE_BACKUP_FREQUENCY?.trim() ?? ''
  const frequency =
    FREQUENCY_KEYWORDS.has(rawFrequency) || CRON_PATTERN.test(rawFrequency) ? rawFrequency : DEFAULT_BACKUP_FREQUENCY
  const s3StorageUuid = env.COOLIFY_BACKUP_S3_STORAGE_UUID?.trim() || undefined
  return {
    frequency,
    ...(s3StorageUuid ? { s3StorageUuid } : {}),
    retentionLocal: intFromEnv(env.DATABASE_BACKUP_RETENTION_LOCAL, 3, 1, 90),
    retentionS3: intFromEnv(env.DATABASE_BACKUP_RETENTION_S3, 14, 1, 365),
    maxAgeHours: intFromEnv(env.DATABASE_BACKUP_MAX_AGE_HOURS, 26, 2, 24 * 31),
  }
}

export type BackupHealth = 'ok' | 'running' | 'never' | 'stale' | 'failed'

export interface BackupSummary {
  health: BackupHealth
  lastSuccessAt: string | null
  lastFailureAt: string | null
  /** Copie hors du serveur active sur au moins une planification. */
  offsite: boolean
  /** Dernières exécutions, plus récentes d'abord. */
  recent: DatabaseBackupExecution[]
}

const time = (iso: string): number => {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : 0
}

/** État d'ensemble des sauvegardes d'une base, à partir des planifications Coolify. Fonction pure. */
export function summarizeBackups(
  schedules: readonly DatabaseBackupSchedule[],
  now: Date,
  maxAgeHours: number,
  recentLimit = 10,
): BackupSummary {
  const executions = schedules
    .flatMap((schedule) => schedule.executions)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt))
  const offsite = schedules.some((schedule) => schedule.saveS3)
  const lastSuccess = executions.find((execution) => execution.status === 'success') ?? null
  const lastFailure = executions.find((execution) => execution.status === 'failed') ?? null
  const latest = executions[0] ?? null

  let health: BackupHealth
  if (!latest) health = 'never'
  else if (latest.status === 'failed') health = 'failed'
  else if (!lastSuccess) health = latest.status === 'running' ? 'running' : 'failed'
  else if (now.getTime() - time(lastSuccess.createdAt) > maxAgeHours * 3_600_000) health = 'stale'
  else health = latest.status === 'running' ? 'running' : 'ok'

  return {
    health,
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    lastFailureAt: lastFailure?.createdAt ?? null,
    offsite,
    recent: executions.slice(0, recentLimit),
  }
}

/**
 * Faut-il alerter ? Une base qui n'a encore jamais été sauvegardée n'alerte qu'après le délai
 * maximal suivant la planification ; un échec ou une sauvegarde trop ancienne alerte tout de suite.
 */
export function backupNeedsAlert(
  summary: Pick<BackupSummary, 'health'>,
  scheduledAt: Date | null,
  now: Date,
  maxAgeHours: number,
): boolean {
  if (summary.health === 'failed' || summary.health === 'stale') return true
  if (summary.health !== 'never') return false
  if (!scheduledAt) return false
  return now.getTime() - scheduledAt.getTime() > maxAgeHours * 3_600_000
}

type BackupTarget = Pick<ProjectDatabase, 'id' | 'kind' | 'coolifyId' | 'backupId'>
type RestoreProofFields = Pick<
  ProjectDatabase,
  | 'lastRestoreExecutionId'
  | 'lastRestoreBackupCreatedAt'
  | 'lastRestoreImportId'
  | 'lastRestoreStartedAt'
  | 'lastRestoreFinishedAt'
  | 'lastRestoreStatus'
  | 'lastSuccessfulRestoreAt'
  | 'lastSuccessfulRestoreBackupCreatedAt'
>

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null)

export interface RestoreProof {
  status: DatabaseImportState | null
  executionId: string | null
  /** Date de la sauvegarde restaurée (tentative en cours ou dernière). */
  backupCreatedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  /** Dernière restauration réussie consignée (preuve). */
  lastSuccessfulAt: string | null
  lastSuccessfulBackupCreatedAt: string | null
}

export function toRestoreProof(fields: RestoreProofFields): RestoreProof {
  const status =
    fields.lastRestoreStatus === 'running' || fields.lastRestoreStatus === 'finished' || fields.lastRestoreStatus === 'failed'
      ? fields.lastRestoreStatus
      : null
  return {
    status,
    executionId: fields.lastRestoreExecutionId ?? null,
    backupCreatedAt: iso(fields.lastRestoreBackupCreatedAt),
    startedAt: iso(fields.lastRestoreStartedAt),
    finishedAt: iso(fields.lastRestoreFinishedAt),
    lastSuccessfulAt: iso(fields.lastSuccessfulRestoreAt),
    lastSuccessfulBackupCreatedAt: iso(fields.lastSuccessfulRestoreBackupCreatedAt),
  }
}

function scheduleNeedsOffsite(schedule: DatabaseBackupSchedule, s3StorageUuid: string): boolean {
  return !schedule.saveS3 || schedule.s3StorageId !== s3StorageUuid
}

async function reconcileBackupSchedules(
  adapter: Awaited<ReturnType<typeof getDatabaseBackupAdapter>>,
  databaseId: string,
  schedules: readonly DatabaseBackupSchedule[],
  settings: BackupSettings,
): Promise<string | null> {
  if (!settings.s3StorageUuid || schedules.length === 0) return null
  for (const schedule of schedules) {
    if (!scheduleNeedsOffsite(schedule, settings.s3StorageUuid)) continue
    const updated = await adapter.updateSchedule(databaseId, schedule.id, {
      frequency: schedule.frequency || settings.frequency,
      enabled: schedule.enabled,
      s3StorageUuid: settings.s3StorageUuid,
      retentionLocal: settings.retentionLocal,
      retentionS3: settings.retentionS3,
    })
    if ('error' in updated) return updated.error
  }
  return null
}

/**
 * Garantit qu'une planification existe. Idempotent : reprend une planification déjà présente dans
 * Coolify (créée à la main, par exemple) plutôt que d'en créer une seconde. Si un stockage S3 est
 * configuré sur la plateforme, applique la copie hors serveur aux planifications existantes.
 */
export async function ensureDatabaseBackup(
  database: BackupTarget,
  settings = backupSettings(),
): Promise<{ backupId: string; created: boolean; reconciled?: boolean } | { error: string }> {
  const adapter = await getDatabaseBackupAdapter(database.kind)
  if (!adapter.supported) {
    return { error: adapter.reason ?? 'Les sauvegardes intégrées ne sont pas disponibles pour ce moteur.' }
  }

  const schedules = await adapter.listSchedules(database.coolifyId)
  if ('error' in schedules) return { error: schedules.error }

  let backupId = database.backupId ?? schedules[0]?.id ?? null
  let created = false
  if (!backupId) {
    const result = await adapter.createSchedule(database.coolifyId, settings)
    if ('error' in result) return { error: result.error }
    backupId = result.id
    created = true
    // La nouvelle planification est créée avec les bons réglages S3.
  } else {
    const reconcileError = await reconcileBackupSchedules(adapter, database.coolifyId, schedules, settings)
    if (reconcileError) return { error: reconcileError }
  }

  await prisma.projectDatabase.update({
    where: { id: database.id },
    data: { backupId, backupScheduledAt: database.backupId ? undefined : new Date() },
  })
  return { backupId, created, ...(settings.s3StorageUuid && !created ? { reconciled: true } : {}) }
}

export interface DatabaseBackupStatus {
  supported: boolean
  kind: string
  engineLabel: string
  scheduled: boolean
  /** Copie hors serveur configurée sur la plateforme (variable d'environnement). */
  offsiteConfigured: boolean
  frequency: string
  /** Au moins une planification copie effectivement vers le stockage S3. */
  scheduleOffsite: boolean | null
  summary: (Omit<BackupSummary, 'recent' | 'offsite'> & { recent: PublicBackupExecution[] }) | null
  /** Dernière restauration consignée (preuve exploitable). */
  restore: RestoreProof | null
  /** Raison lisible quand les sauvegardes intégrées ne sont pas disponibles. */
  unsupportedReason: string | null
  /** Notes/capacités réelles du moteur (stratégie, limites). */
  notes: string[]
  error: string | null
}

/** Exécution telle que renvoyée à l'interface : sans chemin de fichier. */
export interface PublicBackupExecution {
  id: string
  status: DatabaseBackupExecution['status']
  size: number | null
  createdAt: string
  /** Un fichier est encore disponible pour la restaurer. */
  restorable: boolean
  /** Copie hors serveur (S3) confirmée pour cette exécution, quand l'information est disponible. */
  offsiteCopied: boolean | null
}

/**
 * D'où restaurer une exécution : le fichier local s'il existe encore (plus rapide), sinon la copie S3 si un
 * stockage est configuré. `null` si rien n'est disponible. Fonction pure.
 */
export function restoreSourceFor(
  execution: Pick<DatabaseBackupExecution, 'status' | 'filename' | 'localDeleted' | 's3Uploaded'>,
  s3StorageUuid?: string,
): DatabaseImportSource | null {
  if (execution.status !== 'success' || !execution.filename) return null
  if (!execution.localDeleted) return { source: 'server', path: execution.filename }
  if (execution.s3Uploaded && s3StorageUuid) return { source: 's3', s3StorageUuid, path: execution.filename }
  return null
}

export function toPublicExecution(execution: DatabaseBackupExecution, s3StorageUuid?: string): PublicBackupExecution {
  return {
    id: execution.id,
    status: execution.status,
    size: execution.size,
    createdAt: execution.createdAt,
    restorable: restoreSourceFor(execution, s3StorageUuid) !== null,
    offsiteCopied: execution.status === 'success' ? execution.s3Uploaded : null,
  }
}

export async function getDatabaseBackupStatus(
  database: BackupTarget & RestoreProofFields,
  now = new Date(),
  settings = backupSettings(),
): Promise<DatabaseBackupStatus> {
  const adapter = await getDatabaseBackupAdapter(database.kind)
  const cap = isManagedDatabaseKind(database.kind)
    ? (await getDatabaseEngineCapabilities(database.kind)).capabilities
    : null
  const engineLabel = cap?.label ?? getDatabaseEngineCatalog(database.kind as ManagedDatabaseKind)?.label ?? database.kind
  const base = {
    supported: adapter.supported,
    kind: database.kind,
    engineLabel,
    scheduled: Boolean(database.backupId),
    offsiteConfigured: Boolean(settings.s3StorageUuid),
    frequency: settings.frequency,
    restore: toRestoreProof(database),
    unsupportedReason: adapter.supported ? null : (adapter.reason ?? cap?.reason ?? null),
    notes: cap?.notes ?? [],
  }
  if (!base.supported || !database.backupId) {
    return { ...base, scheduleOffsite: null, summary: null, error: null }
  }
  const schedules = await adapter.listSchedules(database.coolifyId)
  if ('error' in schedules) return { ...base, scheduleOffsite: null, summary: null, error: schedules.error }
  const summary = summarizeBackups(schedules, now, settings.maxAgeHours)
  const { offsite, recent, ...rest } = summary
  return {
    ...base,
    scheduleOffsite: offsite,
    summary: { ...rest, recent: recent.map((item) => toPublicExecution(item, settings.s3StorageUuid)) },
    error: null,
  }
}

/**
 * Restaure une sauvegarde réussie de cette base. L'exécution est cherchée dans les planifications de la base
 * elle-même : impossible de viser le fichier d'une autre base. Les données actuelles sont remplacées.
 * Enregistre la tentative (preuve de restauration) dès le lancement.
 */
export async function restoreDatabaseBackup(
  database: BackupTarget,
  executionId: string,
  settings = backupSettings(),
): Promise<{ importId: string; backupCreatedAt: string } | { error: string; status: number }> {
  const adapter = await getDatabaseBackupAdapter(database.kind)
  if (!adapter.supported) {
    return {
      error:
        adapter.reason ?? 'La restauration intégrée n’est pas disponible pour ce moteur sur cette instance.',
      status: 400,
    }
  }
  const schedules = await adapter.listSchedules(database.coolifyId)
  if ('error' in schedules) return { error: schedules.error, status: 502 }
  const execution = schedules.flatMap((schedule) => schedule.executions).find((item) => item.id === executionId)
  if (!execution) return { error: 'Sauvegarde introuvable.', status: 404 }
  const source = restoreSourceFor(execution, settings.s3StorageUuid)
  if (!source) {
    return {
      error:
        execution.status === 'success'
          ? 'Le fichier de cette sauvegarde n’est plus disponible (ni sur le serveur, ni dans le stockage externe).'
          : 'Seule une sauvegarde réussie peut être restaurée.',
      status: 409,
    }
  }
  const started = await adapter.startRestore(database.coolifyId, source)
  if ('error' in started) return { error: started.error, status: 502 }
  const now = new Date()
  const backupCreatedAtDate = Number.isFinite(Date.parse(execution.createdAt)) ? new Date(execution.createdAt) : now
  await prisma.projectDatabase.update({
    where: { id: database.id },
    data: {
      lastRestoreExecutionId: executionId,
      lastRestoreBackupCreatedAt: backupCreatedAtDate,
      lastRestoreImportId: started.id,
      lastRestoreStartedAt: now,
      lastRestoreFinishedAt: null,
      lastRestoreStatus: 'running',
    },
  })
  return { importId: started.id, backupCreatedAt: execution.createdAt }
}

/** État brut d'une restauration côté provider/adaptateur (sans effet de bord). */
export async function getDatabaseRestoreStatus(
  database: Pick<ProjectDatabase, 'kind' | 'coolifyId'>,
  importId: string,
): Promise<{ state: DatabaseImportState; finishedAt: string | null } | { error: string }> {
  const adapter = await getDatabaseBackupAdapter(database.kind)
  return adapter.getRestoreStatus(database.coolifyId, importId)
}

type RestoreTrackTarget = Pick<
  ProjectDatabase,
  'id' | 'kind' | 'coolifyId' | 'lastRestoreImportId' | 'lastRestoreBackupCreatedAt'
>

/**
 * Lit l'état d'une restauration et, si elle est terminée pour l'import suivi, consigne l'issue
 * (preuve de restauration). Idempotent ; ignore un import qui n'est plus celui en cours.
 */
export async function getTrackedRestoreStatus(
  database: RestoreTrackTarget,
  importId: string,
): Promise<{ state: DatabaseImportState; finishedAt: string | null } | { error: string }> {
  const adapter = await getDatabaseBackupAdapter(database.kind)
  const status = await adapter.getRestoreStatus(database.coolifyId, importId)
  if ('error' in status) return status
  if (status.state !== 'running' && database.lastRestoreImportId === importId) {
    const finishedAt = status.finishedAt ? new Date(status.finishedAt) : new Date()
    await prisma.projectDatabase.updateMany({
      where: { id: database.id, lastRestoreImportId: importId },
      data: {
        lastRestoreStatus: status.state,
        lastRestoreFinishedAt: finishedAt,
        ...(status.state === 'finished'
          ? {
              lastSuccessfulRestoreAt: finishedAt,
              lastSuccessfulRestoreBackupCreatedAt: database.lastRestoreBackupCreatedAt ?? undefined,
            }
          : {}),
      },
    })
  }
  return status
}

/** Planifie si besoin, puis lance une sauvegarde immédiate. */
export async function runDatabaseBackupNow(database: BackupTarget): Promise<{ ok: true } | { error: string }> {
  const ensured = await ensureDatabaseBackup(database)
  if ('error' in ensured) return ensured
  const adapter = await getDatabaseBackupAdapter(database.kind)
  return adapter.runSchedule(database.coolifyId, ensured.backupId)
}

/**
 * Passe de surveillance : planifie les bases PostgreSQL qui ne le sont pas encore (bases créées avant
 * cette fonctionnalité) et alerte les propriétaires et administrateurs quand une sauvegarde échoue
 * ou date trop. Une alerte par base et par jour au plus (`dedupeKey`).
 */
export async function evaluateDatabaseBackups(now = new Date(), settings = backupSettings()): Promise<number> {
  // Candidats élargis : le support réel est validé par moteur (capacités/adaptateur) afin de couvrir
  // les extensions multi-moteurs sans promesse implicite pour les moteurs non supportés.
  const databases = await prisma.projectDatabase.findMany({
    where: { kind: { in: [...BACKUP_CANDIDATE_KINDS] } },
    select: {
      id: true,
      kind: true,
      coolifyId: true,
      backupId: true,
      backupScheduledAt: true,
      project: { select: { id: true, name: true, organizationId: true } },
    },
  })

  let alerts = 0
  for (const database of databases) {
    try {
      const adapter = await getDatabaseBackupAdapter(database.kind)
      if (!adapter.supported) continue

      let backupId = database.backupId
      let scheduledAt = database.backupScheduledAt
      if (!backupId) {
        const ensured = await ensureDatabaseBackup(database, settings)
        if ('error' in ensured) {
          console.error('[backups] planification impossible', database.id, ensured.error)
          continue
        }
        backupId = ensured.backupId
        scheduledAt = now
      }
      const schedules = await adapter.listSchedules(database.coolifyId)
      if ('error' in schedules) {
        console.error('[backups] lecture impossible', database.id, schedules.error)
        continue
      }
      if (backupId && settings.s3StorageUuid) {
        const reconcileError = await reconcileBackupSchedules(adapter, database.coolifyId, schedules, settings)
        if (reconcileError) {
          console.error('[backups] réconciliation S3 impossible', database.id, reconcileError)
        }
      }
      const summary = summarizeBackups(schedules, now, settings.maxAgeHours)
      if (!backupNeedsAlert(summary, scheduledAt, now, settings.maxAgeHours)) continue

      const recipients = await memberIds(database.project.organizationId, ['owner', 'admin'])
      const last = summary.lastSuccessAt
        ? `Dernière sauvegarde réussie : ${new Date(summary.lastSuccessAt).toLocaleString('fr-FR', { timeZone: 'UTC' })} (UTC).`
        : 'Aucune sauvegarde réussie à ce jour.'
      const reason =
        summary.health === 'failed'
          ? 'La dernière sauvegarde a échoué.'
          : `Aucune sauvegarde réussie depuis plus de ${settings.maxAgeHours} heures.`
      const notified = await notify({
        userIds: recipients,
        type: 'database.backup_failed',
        title: `Sauvegarde en défaut : ${database.project.name}`,
        body: `${reason} ${last}`,
        href: `/dashboard/projects/${database.project.id}/settings`,
        organizationId: database.project.organizationId,
        dedupeKey: `backup:${database.id}:${now.toISOString().slice(0, 10)}`,
      })
      if (notified.length > 0) alerts++
    } catch (error) {
      console.error('[backups] évaluation impossible', database.id, error)
    }
  }
  return alerts
}

export const DATABASE_BACKUPS_INTERVAL_MS = 6 * 60 * 60 * 1000

let started = false
export function startDatabaseBackupMaintenance(): void {
  if (started || process.env.NODE_ENV === 'test') return
  started = true
  const run = () => {
    evaluateDatabaseBackups().catch((error) => console.error('[backups] exécution impossible', error))
  }
  setTimeout(run, 2 * 60_000)
  setInterval(run, DATABASE_BACKUPS_INTERVAL_MS)
}
