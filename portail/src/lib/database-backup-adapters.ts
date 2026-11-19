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
import { getDatabaseEngineCapabilities, getDatabaseEngineCatalog } from '@/lib/database-capabilities'

/**
 * Adaptateurs des opérations de sauvegarde/restauration par moteur/provider.
 *
 * PostgreSQL est implémenté via Coolify (planification, exécutions, import/restauration, preuve).
 * Les autres moteurs doivent recevoir une stratégie dédiée (outils natifs, capacités Coolify
 * spécifiques, ou provider EFLEX-géré) et être activés uniquement après validation de restauration.
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

const postgresqlCoolifyAdapter: DatabaseBackupAdapter = {
  kind: 'postgresql',
  supported: true,
  listSchedules: listDatabaseBackups,
  createSchedule: createDatabaseBackup,
  updateSchedule: updateDatabaseBackup,
  runSchedule: runDatabaseBackup,
  startRestore: startDatabaseImport,
  getRestoreStatus: getDatabaseImportStatus,
}

type AdapterFactory = () => DatabaseBackupAdapter

const ADAPTER_FACTORIES: Partial<Record<ManagedDatabaseKind, AdapterFactory>> = {
  postgresql: () => postgresqlCoolifyAdapter,
  // mysql/mariadb/mongodb/clickhouse/redis/dragonfly/keydb/sqlite : à implémenter par moteur
  // (stratégie et validation spécifiques) avant activation.
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

  const factory = ADAPTER_FACTORIES[engine]
  if (!factory) {
    return unsupported(
      engine,
      `Aucun adaptateur de sauvegarde/restauration n’est encore implémenté pour ${engineLabel(engine)}.`,
    )
  }

  return factory()
}

/** Moteurs pour lesquels une implémentation d’adaptateur backup/restore existe. */
export function implementedBackupAdapterKinds(): ManagedDatabaseKind[] {
  return (Object.keys(ADAPTER_FACTORIES) as ManagedDatabaseKind[]).filter(Boolean)
}
