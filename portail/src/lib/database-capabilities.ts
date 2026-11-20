import type { ManagedDatabaseKind } from '@/lib/coolify'
import { getCoolifyRuntimeCapabilities, type CoolifyRuntimeCapabilities } from '@/lib/coolify-capabilities'

/**
 * Registre de capacités des moteurs de bases managées.
 *
 * Source de vérité produit : ce qui est exposable/provisionnable/sauvegardable selon le moteur
 * et les capacités réelles de l'instance (Coolify aujourd'hui, autres providers demain).
 * Les opérations ne doivent pas supposer un support implicite : consulter ce registre.
 */

export type DatabaseProviderKind = 'coolify' | 'eflex'

export interface DatabaseEngineCatalogEntry {
  kind: ManagedDatabaseKind
  label: string
  /** Variable principale injectée (source de vérité de la connexion). */
  envKey: string
  /** Alias compatibles injectés si la clé n’est pas déjà utilisée (ex. compatibilité d’app). */
  envAliases: string[]
  description: string
}

export interface DatabaseEngineCapabilities {
  kind: ManagedDatabaseKind
  label: string
  envKey: string
  envAliases: string[]
  description: string
  /** Provisionnement possible sur l'instance/provider courant. */
  provisionSupported: boolean
  /** Cycle de vie (statut, start/stop/restart, suppression) supporté. */
  lifecycleSupported: boolean
  /** Sauvegardes intégrées EFLEX/Coolify supportées. */
  backupSupported: boolean
  /** Restauration intégrée EFLEX supportée. */
  restoreSupported: boolean
  /** Provider effectif pour ce moteur (aujourd'hui Coolify). */
  provider: DatabaseProviderKind
  /** Raison lisible si non provisionnable/support partiel (UI/erreurs). */
  reason?: string
  notes: string[]
}

type LearnedOverride = { provisionSupported: boolean; reason?: string; learnedAt: number }
const LEARNED_TTL_MS = 10 * 60_000
const learnedOverrides = new Map<ManagedDatabaseKind, LearnedOverride>()

export function learnDatabaseEngineCapability(
  kind: ManagedDatabaseKind,
  override: { provisionSupported: boolean; reason?: string },
): void {
  learnedOverrides.set(kind, { ...override, learnedAt: Date.now() })
}

export function clearLearnedDatabaseCapabilities(): void {
  learnedOverrides.clear()
}

function getLearnedOverride(kind: ManagedDatabaseKind): LearnedOverride | null {
  const entry = learnedOverrides.get(kind)
  if (!entry) return null
  if (Date.now() - entry.learnedAt > LEARNED_TTL_MS) {
    learnedOverrides.delete(kind)
    return null
  }
  return entry
}

function isDisabledByPolicy(kind: ManagedDatabaseKind): boolean {
  const key = `EFLEX_DB_DISABLE_${kind.toUpperCase()}`
  const value = process.env[key]
  return value === '1' || value === 'true'
}

export const DATABASE_ENGINE_CATALOG: readonly DatabaseEngineCatalogEntry[] = [
  {
    kind: 'postgresql',
    label: 'PostgreSQL',
    envKey: 'DATABASE_URL',
    envAliases: ['POSTGRES_URL', 'POSTGRESQL_URL'],
    description: 'Base relationnelle privée pour votre application.',
  },
  {
    kind: 'redis',
    label: 'Redis',
    envKey: 'REDIS_URL',
    envAliases: ['CACHE_URL'],
    description: 'Cache et files de travail privés pour votre application.',
  },
  {
    kind: 'mysql',
    label: 'MySQL',
    envKey: 'MYSQL_URL',
    envAliases: [],
    description: 'Base relationnelle MySQL privée pour votre application.',
  },
  {
    kind: 'mariadb',
    label: 'MariaDB',
    envKey: 'MARIADB_URL',
    envAliases: ['MYSQL_URL'],
    description: 'Base relationnelle MariaDB (compatible MySQL) privée pour votre application.',
  },
  {
    kind: 'mongodb',
    label: 'MongoDB',
    envKey: 'MONGODB_URL',
    envAliases: ['MONGO_URL'],
    description: 'Base de données documentaire MongoDB privée pour votre application.',
  },
  {
    kind: 'clickhouse',
    label: 'ClickHouse',
    envKey: 'CLICKHOUSE_URL',
    envAliases: [],
    description: 'Base analytique orientée colonnes (logs, métriques, événements).',
  },
  {
    kind: 'dragonfly',
    label: 'Dragonfly',
    envKey: 'DRAGONFLY_URL',
    envAliases: ['REDIS_URL', 'CACHE_URL'],
    description: 'Magasin en mémoire compatible Redis, haute performance.',
  },
  {
    kind: 'keydb',
    label: 'KeyDB',
    envKey: 'KEYDB_URL',
    envAliases: ['REDIS_URL', 'CACHE_URL'],
    description: 'Magasin en mémoire compatible Redis (alternative multi-thread).',
  },
  {
    kind: 'sqlite',
    label: 'SQLite',
    envKey: 'SQLITE_URL',
    envAliases: [],
    description: 'Base de données SQLite managée (fichier), selon le support de l’hébergement.',
  },
] as const

const CATALOG_BY_KIND = new Map(DATABASE_ENGINE_CATALOG.map((entry) => [entry.kind, entry]))

export function getDatabaseEngineCatalog(kind: ManagedDatabaseKind): DatabaseEngineCatalogEntry | undefined {
  return CATALOG_BY_KIND.get(kind)
}

export function isManagedDatabaseKind(value: unknown): value is ManagedDatabaseKind {
  return typeof value === 'string' && CATALOG_BY_KIND.has(value as ManagedDatabaseKind)
}

/** Moteurs dont l'API Coolify `/databases/{kind}` est connue (inventaire v4.7.5). */
const COOLIFY_KNOWN_DB_KINDS = new Set<ManagedDatabaseKind>(DATABASE_ENGINE_CATALOG.map((entry) => entry.kind))

/** Moteurs pour lesquels Coolify expose des sauvegardes planifiées exploitables via l'API générique. */
const COOLIFY_GENERIC_BACKUP_KINDS = new Set<ManagedDatabaseKind>(['postgresql', 'mysql', 'mariadb', 'mongodb'])

function baseNotes(kind: ManagedDatabaseKind): string[] {
  if (kind === 'postgresql') {
    return [
      'Variable injectée : DATABASE_URL.',
      'Sauvegardes planifiées et restauration assistée prises en charge par EFLEX (selon configuration Coolify).',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'RPO sans archivage WAL : perte possible des données écrites depuis la dernière sauvegarde réussie.',
    ]
  }
  if (kind === 'mysql') {
    return [
      'Variable injectée : MYSQL_URL (certaines apps attendent DATABASE_URL ou DB_*).',
      'Sauvegardes/restauration via l’adaptateur Coolify générique (outils natifs du moteur). À valider sur votre instance Coolify.',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'Vérifiez régulièrement la restaurabilité dans un environnement isolé avant de considérer une sauvegarde comme garantie.',
    ]
  }
  if (kind === 'mariadb') {
    return [
      'Variable injectée : MARIADB_URL (compatible MySQL ; certaines apps attendent DATABASE_URL/MYSQL_URL).',
      'Sauvegardes/restauration via l’adaptateur Coolify générique (outils natifs du moteur). À valider sur votre instance Coolify.',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'Vérifiez régulièrement la restaurabilité dans un environnement isolé avant de considérer une sauvegarde comme garantie.',
    ]
  }
  if (kind === 'mongodb') {
    return [
      'Variable injectée : MONGODB_URL (certaines apps attendent MONGO_URL ou DATABASE_URL).',
      'Sauvegardes/restauration via l’adaptateur Coolify générique (outils natifs du moteur, ex. dump). À valider sur votre instance Coolify.',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'Le format et la restaurabilité dépendent du moteur/outillage de l’instance : testez la restauration en environnement isolé.',
    ]
  }
  if (kind === 'redis') {
    return [
      'Variable injectée : REDIS_URL (certaines apps attendent aussi CACHE_URL/QUEUE_URL).',
      'Aucune sauvegarde/restauration intégrée EFLEX : Coolify ne sauvegarde pas Redis.',
      'Recommandé comme cache/file éphémère. Si des données durables sont stockées, configurez la persistance Redis (AOF/RDB) côté service et une stratégie de sauvegarde dédiée ; aucune garantie de restauration n’est fournie par EFLEX.',
    ]
  }
  if (kind === 'dragonfly' || kind === 'keydb') {
    return [
      `Variable injectée : ${kind === 'dragonfly' ? 'DRAGONFLY_URL' : 'KEYDB_URL'} (compatible Redis ; certaines apps attendent REDIS_URL).`,
      'Aucune sauvegarde/restauration intégrée EFLEX pour ce moteur en mémoire.',
      'À utiliser comme cache/file sauf configuration de persistance et stratégie de sauvegarde propres au moteur, validées et testées.',
    ]
  }
  if (kind === 'clickhouse') {
    return [
      'Variable injectée : CLICKHOUSE_URL.',
      'Base analytique : vérifier le driver/protocole attendu par l’application.',
      'Sauvegardes/restauration intégrées EFLEX non disponibles. Utilisez les mécanismes natifs ClickHouse (BACKUP/RESTORE, snapshots, exports) et testez la restauration.',
    ]
  }
  if (kind === 'sqlite') {
    return [
      'Variable injectée : SQLITE_URL (format/chemin dépendant de Coolify et du runtime applicatif).',
      'Support à valider sur l’instance Coolify : provisionnement, URL/chemin, persistance et cycle de vie peuvent varier.',
      'Sauvegardes/restauration intégrées EFLEX non disponibles. Sauvegardez le fichier de base selon le stockage/volume réel et testez la restauration.',
    ]
  }
  return ['Sauvegardes/restauration intégrées EFLEX non disponibles pour ce moteur (à gérer selon ses outils natifs).']
}

export function supportsCoolifyGenericBackup(kind: ManagedDatabaseKind): boolean {
  return COOLIFY_GENERIC_BACKUP_KINDS.has(kind)
}

/**
 * Résout les capacités d'un moteur pour une instance Coolify donnée.
 * Aujourd'hui le provider est Coolify ; un provider EFLEX-géré pourra être sélectionné ici
 * quand une capacité manque côté Coolify.
 */
export function resolveDatabaseEngineCapabilities(
  kind: ManagedDatabaseKind,
  runtime: CoolifyRuntimeCapabilities,
): DatabaseEngineCapabilities {
  const entry = CATALOG_BY_KIND.get(kind)
  if (!entry) {
    // Sécurité type : ne devrait pas arriver.
    return {
      kind,
      label: kind,
      envKey: 'DATABASE_URL',
      envAliases: [],
      description: '',
      provisionSupported: false,
      lifecycleSupported: false,
      backupSupported: false,
      restoreSupported: false,
      provider: 'coolify',
      reason: 'Moteur inconnu.',
      notes: [],
    }
  }

  const notes = baseNotes(kind)
  const knownByCoolify = COOLIFY_KNOWN_DB_KINDS.has(kind)

  // Coolify injoignable : on reste permissif sur le provisionnement connu (l'appel échouera avec
  // une erreur explicite), mais on signale l'incertitude. Cela évite de masquer des moteurs
  // valides lors d'un incident réseau transitoire.
  if (!runtime.reachable) {
    notes.push('Instance Coolify non joignable : la disponibilité réelle n’a pas pu être vérifiée.')
  } else if (runtime.databaseApiAvailable === false) {
    notes.push('L’API de bases managées Coolify ne semble pas disponible sur cette instance.')
  } else if (runtime.databaseApiAvailable === null) {
    notes.push('Disponibilité de l’API de bases managées non confirmée (sondage incomplet).')
  }

  const apiCompatible = runtime.databaseApiAvailable !== false
  let provisionSupported = knownByCoolify && apiCompatible
  let lifecycleSupported = knownByCoolify && apiCompatible
  // Sauvegardes/restauration via l'adaptateur Coolify générique : disponibles pour les moteurs
  // pris en charge par Coolify quand l'API est compatible. La restaurabilité effective dépend de
  // l'instance/outillage et doit être vérifiée (preuve de restauration).
  const backupSupported = COOLIFY_GENERIC_BACKUP_KINDS.has(kind) && apiCompatible
  const restoreSupported = COOLIFY_GENERIC_BACKUP_KINDS.has(kind) && apiCompatible

  let reason: string | undefined
  if (!apiCompatible) {
    reason = 'L’API de bases managées n’est pas disponible sur cette instance Coolify.'
  } else if (kind === 'sqlite') {
    reason = 'Support SQLite à valider sur cette instance (URL/persistance/comportement).'
  }

  if (isDisabledByPolicy(kind)) {
    provisionSupported = false
    lifecycleSupported = false
    reason = `Le moteur ${entry.label} est désactivé par la configuration de la plateforme.`
    notes.push('Désactivé par politique de plateforme (EFLEX_DB_DISABLE_*).')
  }

  const learned = getLearnedOverride(kind)
  if (learned) {
    if (!learned.provisionSupported) {
      provisionSupported = false
      lifecycleSupported = false
      reason = learned.reason ?? `Le moteur ${entry.label} n’est pas supporté par cette instance.`
      notes.push('Capacité ajustée d’après une réponse de l’instance (détection réactive).')
    }
  }

  return {
    ...entry,
    provisionSupported,
    lifecycleSupported,
    backupSupported,
    restoreSupported,
    provider: 'coolify',
    ...(reason ? { reason } : {}),
    notes,
  }
}

export async function listDatabaseEngineCapabilities(options?: {
  force?: boolean
}): Promise<{ runtime: CoolifyRuntimeCapabilities; engines: DatabaseEngineCapabilities[] }> {
  if (options?.force) clearLearnedDatabaseCapabilities()
  const runtime = await getCoolifyRuntimeCapabilities({ force: options?.force })
  const engines = DATABASE_ENGINE_CATALOG.map((entry) => resolveDatabaseEngineCapabilities(entry.kind, runtime))
  return { runtime, engines }
}

/** Capacités d'un moteur (raccourci async). */
export async function getDatabaseEngineCapabilities(
  kind: ManagedDatabaseKind,
  options?: { force?: boolean },
): Promise<{ runtime: CoolifyRuntimeCapabilities; capabilities: DatabaseEngineCapabilities }> {
  if (options?.force) clearLearnedDatabaseCapabilities()
  const runtime = await getCoolifyRuntimeCapabilities({ force: options?.force })
  return { runtime, capabilities: resolveDatabaseEngineCapabilities(kind, runtime) }
}
