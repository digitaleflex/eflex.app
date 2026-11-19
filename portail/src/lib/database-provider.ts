import type { ManagedDatabaseInfo, ManagedDatabaseKind } from '@/lib/coolify'
import {
  createManagedDatabase,
  deleteManagedDatabase,
  getManagedDatabase,
  managedDatabaseAction,
} from '@/lib/coolify'
import {
  getDatabaseEngineCapabilities,
  type DatabaseEngineCapabilities,
  type DatabaseProviderKind,
} from '@/lib/database-capabilities'

/**
 * Point d'accès aux opérations de bases managées via un provider (adaptateur).
 *
 * Aujourd'hui : provider Coolify pour tous les moteurs connus. Un provider EFLEX-géré pourra
 * être ajouté ici pour les moteurs/capacités non couverts par Coolify, derrière le même contrat.
 */

export interface DatabaseProvider {
  readonly kind: DatabaseProviderKind
  createManagedDatabase(kind: ManagedDatabaseKind, name: string): Promise<ManagedDatabaseInfo | { error: string }>
  getManagedDatabase(id: string, timeoutMs?: number): Promise<ManagedDatabaseInfo | { error: string }>
  deleteManagedDatabase(id: string): Promise<{ ok: true } | { error: string }>
  managedDatabaseAction(id: string, action: 'start' | 'stop' | 'restart'): Promise<{ ok: true } | { error: string }>
}

const coolifyDatabaseProvider: DatabaseProvider = {
  kind: 'coolify',
  createManagedDatabase,
  getManagedDatabase,
  deleteManagedDatabase,
  managedDatabaseAction,
}

export async function resolveDatabaseProvider(
  engineKind: ManagedDatabaseKind,
): Promise<{ provider: DatabaseProvider; capabilities: DatabaseEngineCapabilities } | { error: string; capabilities?: DatabaseEngineCapabilities }> {
  const { capabilities } = await getDatabaseEngineCapabilities(engineKind)
  if (capabilities.provider === 'coolify') {
    return { provider: coolifyDatabaseProvider, capabilities }
  }
  // Futur : provider EFLEX-géré.
  return {
    error:
      capabilities.reason ??
      `Aucun provider disponible pour ${capabilities.label} sur cette instance.`,
    capabilities,
  }
}

export function getDatabaseProviderByKind(provider: DatabaseProviderKind): DatabaseProvider {
  if (provider === 'coolify') return coolifyDatabaseProvider
  throw new Error(`Provider de base de données non implémenté : ${provider}`)
}
