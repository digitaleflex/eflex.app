import type { ManagedDatabaseKind } from '@/lib/coolify'
import {
  createDatabaseBackup,
  getDatabaseImportStatus,
  listDatabaseBackups,
  runDatabaseBackup,
  startDatabaseImport,
  updateDatabaseBackup,
  type DatabaseBackupOptions,
  type DatabaseBackupSchedule,
  type DatabaseImportSource,
  type DatabaseImportState,
} from '@/lib/coolify'
import {
  getDatabaseEngineCapabilities,
  getDatabaseEngineCatalog,
  supportsCoolifyGenericBackup,
} from '@/lib/database-capabilities'

/**
 * Adaptateurs des opérations de sauvegarde/restauration par moteur/provider.
 *
 * Implémentation actuelle : Coolify (API générique /databases/{uuid}/backups et /imports) pour les
 * moteurs pris en charge par Coolify (PostgreSQL, MySQL, MariaDB, MongoDB selon les capacités/outils
 * de l'instance). Les autres moteurs exposent une dégradation explicite avec raison.
 */

export interface DatabaseBackupAdapter {
  kind: ManagedDatabaseKind
  supported: boolean
  reason?: string
  listSchedules(databaseId: string, timeoutMs?: number): Promise<DatabaseBackupSchedule[] | { error: string }>
  createSchedule(databaseId: string, options: DatabaseBackupOptions): Promise<{ id: string } | { error: string }>
  updateSchedule(
    databaseId: string,
    scheduleId: string,
    options: DatabaseBackupOptions & { enabled?: boolean },
  ): Promise<{ ok: true } | { error: string }>
  runSchedule(databaseId: string, scheduleId: string): Promise<{ ok: true } | { error: string }>
  startRestore(
    databaseId: string,
    source: DatabaseImportSource,
  ): Promise<{ id: string } | { error: string }>
  getRestoreStatus(
    databaseId: string,
    importId: string,
  ): Promise<{ state: DatabaseImportState; finishedAt: string | null } | { error: string }>
}

const unsupported = (kind: ManagedDatabaseKind, reason: string): DatabaseBackupAdapter => {
  const err = { error: reason }
  return {
    kind,
    supported: false,
    reason,
    listSchedules: async () => err,
    createSchedule: async () => err,
    updateSchedule: async () => err,
    runSchedule: async () => err,
    startRestore: async () => err,
    getRestoreStatus: async () => err,
  }
}

function coolifyGenericAdapter(kind: ManagedDatabaseKind): DatabaseBackupAdapter {
  return {
    kind,
    supported: true,
    listSchedules: listDatabaseBackups,
    createSchedule: createDatabaseBackup,
    updateSchedule: updateDatabaseBackup,
    runSchedule: runDatabaseBackup,
    startRestore: startDatabaseImport,
    getRestoreStatus: getDatabaseImportStatus,
  }
}

function engineLabel(kind: ManagedDatabaseKind): string {
  return getDatabaseEngineCatalog(kind)?.label ?? kind
}

export async function getDatabaseBackupAdapter(kind: string): Promise<DatabaseBackupAdapter> {
  const engine = kind as ManagedDatabaseKind
  const { capabilities } = await getDatabaseEngineCapabilities(engine)
  if (!capabilities.backupSupported) {
    return unsupported(
      engine,
      capabilities.reason ?? `Les sauvegardes/restaurations intégrées ne sont pas disponibles pour ${engineLabel(engine)}.`,
    )
  }

  if (supportsCoolifyGenericBackup(engine)) {
    return coolifyGenericAdapter(engine)
  }

  return unsupported(
    engine,
    `Aucun adaptateur de sauvegarde/restauration n’est encore implémenté pour ${engineLabel(engine)}.`,
  )
}

/** Moteurs pour lesquels une implémentation d’adaptateur backup/restore Coolify générique existe. */
export function implementedBackupAdapterKinds(): ManagedDatabaseKind[] {
  return (['postgresql', 'mysql', 'mariadb', 'mongodb'] as ManagedDatabaseKind[]).filter((kind) =>
    supportsCoolifyGenericBackup(kind),
  )
}
