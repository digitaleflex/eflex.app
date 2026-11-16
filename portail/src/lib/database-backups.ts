import type { ProjectDatabase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  createDatabaseBackup,
  getDatabaseImportStatus,
  listDatabaseBackups,
  runDatabaseBackup,
  startDatabaseImport,
  type DatabaseBackupExecution,
  type DatabaseBackupSchedule,
  type DatabaseImportSource,
  type DatabaseImportState,
} from '@/lib/coolify'
import { memberIds, notify } from '@/lib/notifications'

/**
 * Sauvegardes des bases managées.
 *
 * Coolify exécute les sauvegardes (`pg_dump`) selon une planification ; E-FLEX la crée, l'affiche et
 * alerte quand elle ne fonctionne plus. Avec `COOLIFY_BACKUP_S3_STORAGE_UUID` (stockage S3 déclaré
 * dans Coolify), chaque sauvegarde est aussi copiée hors du serveur ; sans lui, les copies restent sur
 * le serveur de la base, ce que l'interface signale. Coolify ne sait pas sauvegarder Redis : seules
 * les bases PostgreSQL sont concernées. Restauration : `POST /databases/{uuid}/imports` (Coolify ≥ 4.7),
 * depuis le fichier resté sur le serveur, sinon depuis la copie S3. Procédure et script de vérification
 * dans `docs/operations/client-database-backups.md`.
 */

export const BACKUP_SUPPORTED_KINDS = ['postgresql'] as const

export function backupSupported(kind: string): boolean {
  return (BACKUP_SUPPORTED_KINDS as readonly string[]).includes(kind)
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

/**
 * Garantit qu'une planification existe. Idempotent : reprend une planification déjà présente dans
 * Coolify (créée à la main, par exemple) plutôt que d'en créer une seconde.
 */
export async function ensureDatabaseBackup(
  database: BackupTarget,
  settings = backupSettings(),
): Promise<{ backupId: string; created: boolean } | { error: string }> {
  if (!backupSupported(database.kind)) return { error: 'Les sauvegardes ne sont disponibles que pour PostgreSQL.' }
  if (database.backupId) return { backupId: database.backupId, created: false }

  const existing = await listDatabaseBackups(database.coolifyId)
  if ('error' in existing) return { error: existing.error }
  let backupId = existing[0]?.id ?? null
  let created = false
  if (!backupId) {
    const result = await createDatabaseBackup(database.coolifyId, settings)
    if ('error' in result) return { error: result.error }
    backupId = result.id
    created = true
  }
  await prisma.projectDatabase.update({
    where: { id: database.id },
    data: { backupId, backupScheduledAt: new Date() },
  })
  return { backupId, created }
}

export interface DatabaseBackupStatus {
  supported: boolean
  scheduled: boolean
  /** Copies hors serveur configurées sur la plateforme (variable d'environnement). */
  offsiteConfigured: boolean
  frequency: string
  summary: (Omit<BackupSummary, 'recent'> & { recent: PublicBackupExecution[] }) | null
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
  }
}

export async function getDatabaseBackupStatus(
  database: BackupTarget,
  now = new Date(),
  settings = backupSettings(),
): Promise<DatabaseBackupStatus> {
  const base = {
    supported: backupSupported(database.kind),
    scheduled: Boolean(database.backupId),
    offsiteConfigured: Boolean(settings.s3StorageUuid),
    frequency: settings.frequency,
  }
  if (!base.supported || !database.backupId) return { ...base, summary: null, error: null }
  const schedules = await listDatabaseBackups(database.coolifyId)
  if ('error' in schedules) return { ...base, summary: null, error: schedules.error }
  const summary = summarizeBackups(schedules, now, settings.maxAgeHours)
  return {
    ...base,
    summary: { ...summary, recent: summary.recent.map((item) => toPublicExecution(item, settings.s3StorageUuid)) },
    error: null,
  }
}

/**
 * Restaure une sauvegarde réussie de cette base. L'exécution est cherchée dans les planifications de la base
 * elle-même : impossible de viser le fichier d'une autre base. Les données actuelles sont remplacées.
 */
export async function restoreDatabaseBackup(
  database: BackupTarget,
  executionId: string,
  settings = backupSettings(),
): Promise<{ importId: string; backupCreatedAt: string } | { error: string; status: number }> {
  if (!backupSupported(database.kind)) return { error: 'La restauration n’est disponible que pour PostgreSQL.', status: 400 }
  const schedules = await listDatabaseBackups(database.coolifyId)
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
  const started = await startDatabaseImport(database.coolifyId, source)
  if ('error' in started) return { error: started.error, status: 502 }
  return { importId: started.id, backupCreatedAt: execution.createdAt }
}

export async function getDatabaseRestoreStatus(
  database: Pick<ProjectDatabase, 'coolifyId'>,
  importId: string,
): Promise<{ state: DatabaseImportState; finishedAt: string | null } | { error: string }> {
  return getDatabaseImportStatus(database.coolifyId, importId)
}

/** Planifie si besoin, puis lance une sauvegarde immédiate. */
export async function runDatabaseBackupNow(database: BackupTarget): Promise<{ ok: true } | { error: string }> {
  const ensured = await ensureDatabaseBackup(database)
  if ('error' in ensured) return ensured
  return runDatabaseBackup(database.coolifyId, ensured.backupId)
}

/**
 * Passe de surveillance : planifie les bases PostgreSQL qui ne le sont pas encore (bases créées avant
 * cette fonctionnalité) et alerte les propriétaires et administrateurs quand une sauvegarde échoue
 * ou date trop. Une alerte par base et par jour au plus (`dedupeKey`).
 */
export async function evaluateDatabaseBackups(now = new Date(), settings = backupSettings()): Promise<number> {
  const databases = await prisma.projectDatabase.findMany({
    where: { kind: { in: [...BACKUP_SUPPORTED_KINDS] } },
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
      const schedules = await listDatabaseBackups(database.coolifyId)
      if ('error' in schedules) {
        console.error('[backups] lecture impossible', database.id, schedules.error)
        continue
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
