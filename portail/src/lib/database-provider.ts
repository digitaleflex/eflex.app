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
 * Point d'accès aux opérations de bases managées via un provider/adaptateur (#181).
 *
 * - Provider Coolify (défaut) : délègue aux APIs Coolify lorsque les capacités le permettent.
 * - Provider EFLEX-géré (seam) : sélectionnable par politique/capacités comme alternative contrôlée.
 *   Aucun provisionnement implicite n'est effectué : les opérations refusent explicitement tant
 *   qu'un adaptateur concret, validé et activé n'est enregistré pour le moteur (sécurité/isolation,
 *   persistance, réseau privé, secrets, supervision, sauvegarde/restauration).
 *
 * La sélection est pilotée par le registre de capacités (`database-capabilities.ts`, #183).
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

function eflexUnavailableReason(label: string, capabilities: DatabaseEngineCapabilities): string {
  return (
    capabilities.reason ??
    `Le provider EFLEX-géré est sélectionné pour ${label}, mais aucun adaptateur de provisionnement/lifecycle n’est activé sur cette instance. ` +
      'Activation possible uniquement via un adaptateur validé (persistance, réseau privé, healthcheck, secrets chiffrés, supervision et sauvegardes).'
  )
}

/**
 * Adaptateur EFLEX-géré (candidat/socle #181) : refuse de manière sûre et explicite.
 * Sert de point d’extension câblé ; un adaptateur réel doit être enregistré et validé avant usage.
 */
const eflexManagedProvider: DatabaseProvider = {
  kind: 'eflex',
  async createManagedDatabase(kind, _name) {
    const { capabilities } = await getDatabaseEngineCapabilities(kind)
    return { error: eflexUnavailableReason(capabilities.label, capabilities) }
  },
  async getManagedDatabase(_id, _timeoutMs) {
    return { error: 'Ressource EFLEX-gérée introuvable ou adaptateur non activé sur cette instance.' }
  },
  async deleteManagedDatabase(_id) {
    return { error: 'Suppression impossible : adaptateur EFLEX-géré non activé sur cette instance.' }
  },
  async managedDatabaseAction(_id, _action) {
    return { error: 'Action impossible : adaptateur EFLEX-géré non activé sur cette instance.' }
  },
}

export async function resolveDatabaseProvider(
  engineKind: ManagedDatabaseKind,
): Promise<{ provider: DatabaseProvider; capabilities: DatabaseEngineCapabilities } | { error: string; capabilities?: DatabaseEngineCapabilities }> {
  const { capabilities } = await getDatabaseEngineCapabilities(engineKind)

  const provider = capabilities.provider === 'eflex' ? eflexManagedProvider : coolifyDatabaseProvider

  // Refus explicite si aucune capacité exploitable n'est disponible pour le provisioning/lifecycle.
  if (!capabilities.provisionSupported && !capabilities.lifecycleSupported) {
    return {
      error:
        capabilities.reason ??
        `Aucun provider capable de prendre en charge ${capabilities.label} n’est disponible sur cette instance.`,
      capabilities,
    }
  }

  return { provider, capabilities }
}

export function getDatabaseProviderByKind(provider: DatabaseProviderKind): DatabaseProvider {
  if (provider === 'coolify') return coolifyDatabaseProvider
  if (provider === 'eflex') return eflexManagedProvider
  throw new Error(`Provider de base de données non implémenté : ${String(provider)}`)
}

/**
 * Résout le provider associé à une base déjà enregistrée (opérations sur ressource existante).
 * Les bases existantes restent opérées par leur provider historique (Coolify) sauf évolution explicite.
 */
export function getProviderForStoredKind(kind: ManagedDatabaseKind): DatabaseProvider {
  // Aujourd'hui toutes les ressources persistées sont provisionnées via Coolify.
  // Le point d'extension permet de router vers EFLEX si `ProjectDatabase.provider` est ajouté.
  void kind
  return coolifyDatabaseProvider
}

