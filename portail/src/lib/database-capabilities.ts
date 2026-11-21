import type { ManagedDatabaseKind } from '@/lib/coolify'
import { getCoolifyRuntimeCapabilities, type CoolifyRuntimeCapabilities } from '@/lib/coolify-capabilities'

export type { ManagedDatabaseKind }

/**
 * Registre de capacités des moteurs de bases managées (#183) et politique de sélection (#181/#184).
 *
 * Source de vérité produit : ce qui est réellement exposable/provisionnable/opérable selon le moteur,
 * les capacités détectées de l'instance (Coolify aujourd'hui) et la politique de plateforme.
 * Les opérations ne doivent pas supposer un support implicite : consulter ce registre.
 *
 * Politique (#181, ADR-0013) : Coolify est le provider par défaut quand ses capacités couvrent le besoin.
 * Un provider EFLEX-géré peut être sélectionné comme alternative/candidat lorsque la politique ou
 * les capacités l'autorisent (fallback contrôlé), derrière le même contrat, sans promettre ce qui
 * n'est pas implémenté sur cette instance.
 */

export type DatabaseProviderKind = 'coolify' | 'eflex'

/** Opérations gouvernées par capacités. */
export type DatabaseOperation = 'provision' | 'lifecycle' | 'backup' | 'restore'

export type DatabaseSupportMaturity = 'stable' | 'experimental' | 'unsupported' | 'planned'

export interface DatabaseOperationCapability {
  operation: DatabaseOperation
  supported: boolean
  provider: DatabaseProviderKind | null
  /** Raison explicite si non supporté, partiel ou conditionnel. */
  reason?: string
}

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
  /** Provider effectif sélectionné pour les opérations supportées. */
  provider: DatabaseProviderKind
  /** Raison lisible si non provisionnable/support partiel (UI/erreurs). */
  reason?: string
  notes: string[]
  /** Niveau de maturité/validation du support pour ce moteur sur cette plateforme. */
  maturity: DatabaseSupportMaturity
  /** Détail explicite par opération (source de vérité fine). */
  operations: Record<DatabaseOperation, DatabaseOperationCapability>
  /** Politique de sélection appliquée (traçabilité). */
  selectionPolicy: {
    preferred: DatabaseProviderKind
    selected: DatabaseProviderKind
    /** `coolify` | `eflex` | `none` selon le résultat. */
    outcome: 'coolify' | 'eflex' | 'none'
    /** Explication lisible de la décision. */
    reason?: string
  }
  /** Probing/capacités instance : fraîcheur indicative. */
  probedAt: number | null
  probeSource: 'runtime' | 'policy' | 'learned' | 'mixed'
}

type LearnedOperation = DatabaseOperation | 'all'

type LearnedOverride = {
  operation: LearnedOperation
  supported: boolean
  reason?: string
  learnedAt: number
}

const LEARNED_TTL_MS = 10 * 60_000
const learnedOverrides = new Map<ManagedDatabaseKind, LearnedOverride[]>()

export function learnDatabaseEngineCapability(
  kind: ManagedDatabaseKind,
  override: { provisionSupported?: boolean; supported?: boolean; reason?: string; operation?: LearnedOperation },
): void {
  const operation = override.operation ?? 'all'
  const supported = override.supported ?? override.provisionSupported ?? false
  const list = learnedOverrides.get(kind) ?? []
  list.push({ operation, supported, reason: override.reason, learnedAt: Date.now() })
  learnedOverrides.set(kind, list)
}

export function clearLearnedDatabaseCapabilities(): void {
  learnedOverrides.clear()
}

function getLearnedOverrides(kind: ManagedDatabaseKind): LearnedOverride[] {
  const list = learnedOverrides.get(kind)
  if (!list) return []
  const fresh = list.filter((entry) => Date.now() - entry.learnedAt <= LEARNED_TTL_MS)
  if (fresh.length === 0) learnedOverrides.delete(kind)
  else learnedOverrides.set(kind, fresh)
  return fresh
}

function envFlag(name: string): boolean {
  const value = process.env[name]
  return value === '1' || value === 'true'
}

function isDisabledByPolicy(kind: ManagedDatabaseKind): boolean {
  return envFlag(`EFLEX_DB_DISABLE_${kind.toUpperCase()}`)
}

/** Activation explicite d’un moteur expérimental (ex. SQLite) après validation instance. */
function isExperimentalEnabled(kind: ManagedDatabaseKind): boolean {
  return envFlag(`EFLEX_DB_EXPERIMENTAL_${kind.toUpperCase()}`)
}

/** Politique de provider préférée (globalement ou par moteur). */
export function preferredProviderFor(kind: ManagedDatabaseKind): DatabaseProviderKind {
  const perKind = process.env[`EFLEX_DB_PROVIDER_${kind.toUpperCase()}`]?.trim().toLowerCase()
  if (perKind === 'eflex') return 'eflex'
  if (perKind === 'coolify') return 'coolify'
  const global = process.env.EFLEX_DB_PROVIDER_DEFAULT?.trim().toLowerCase()
  if (global === 'eflex') return 'eflex'
  return 'coolify'
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
    description: 'Base de données SQLite (fichier), support expérimental selon l’hébergement.',
  },
] as const

const CATALOG_BY_KIND = new Map(DATABASE_ENGINE_CATALOG.map((entry) => [entry.kind, entry]))

export function getDatabaseEngineCatalog(kind: ManagedDatabaseKind): DatabaseEngineCatalogEntry | undefined {
  return CATALOG_BY_KIND.get(kind)
}

export function isManagedDatabaseKind(value: unknown): value is ManagedDatabaseKind {
  return typeof value === 'string' && CATALOG_BY_KIND.has(value as ManagedDatabaseKind)
}

/** Moteurs dont l'endpoint Coolify `/databases/{kind}` est connu (inventaire v4.7.5). */
const COOLIFY_KNOWN_DB_KINDS = new Set<ManagedDatabaseKind>(DATABASE_ENGINE_CATALOG.map((entry) => entry.kind))

/** Moteurs pour lesquels Coolify expose des sauvegardes planifiées exploitables via l'API générique (#180). */
const COOLIFY_GENERIC_BACKUP_KINDS = new Set<ManagedDatabaseKind>(['postgresql', 'mysql', 'mariadb', 'mongodb'])

export function supportsCoolifyGenericBackup(kind: ManagedDatabaseKind): boolean {
  return COOLIFY_GENERIC_BACKUP_KINDS.has(kind)
}

function maturityFor(kind: ManagedDatabaseKind): DatabaseSupportMaturity {
  if (kind === 'postgresql') return 'stable'
  if (kind === 'redis') return 'stable'
  if (kind === 'sqlite') return 'experimental'
  return 'experimental'
}

function baseNotes(kind: ManagedDatabaseKind): string[] {
  if (kind === 'postgresql') {
    return [
      'Variable injectée : DATABASE_URL (alias possibles : POSTGRES_URL, POSTGRESQL_URL).',
      'Sauvegardes planifiées et restauration assistée prises en charge par EFLEX (selon configuration Coolify).',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'RPO sans archivage WAL : perte possible des données écrites depuis la dernière sauvegarde réussie.',
      'Base privée : accessible uniquement depuis le réseau interne de l’application.',
    ]
  }
  if (kind === 'redis') {
    return [
      'Variable injectée : REDIS_URL (alias possible : CACHE_URL).',
      'Aucune sauvegarde/restauration intégrée EFLEX : Coolify ne sauvegarde pas Redis.',
      'Recommandé comme cache/file éphémère. Si des données durables sont stockées, configurez la persistance Redis (AOF/RDB) côté service et une stratégie de sauvegarde dédiée ; aucune garantie de restauration n’est fournie par EFLEX.',
      'Base privée : accessible uniquement depuis le réseau interne de l’application.',
    ]
  }
  if (kind === 'dragonfly' || kind === 'keydb') {
    return [
      `Variable injectée : ${kind === 'dragonfly' ? 'DRAGONFLY_URL' : 'KEYDB_URL'} (alias Redis compatibles possibles).`,
      'Aucune sauvegarde/restauration intégrée EFLEX pour ce moteur en mémoire.',
      'À utiliser comme cache/file sauf configuration de persistance et stratégie de sauvegarde propres au moteur, validées et testées.',
      'Moteur exposé selon le support réel de l’instance Coolify.',
    ]
  }
  if (kind === 'mysql') {
    return [
      'Variable injectée : MYSQL_URL (certaines applications attendent DATABASE_URL ou DB_HOST/DB_*).',
      'Sauvegardes/restauration via l’adaptateur Coolify générique (outils natifs du moteur) lorsque l’instance est compatible. À valider sur votre instance Coolify.',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'Vérifiez régulièrement la restaurabilité dans un environnement isolé avant de considérer une sauvegarde comme garantie.',
    ]
  }
  if (kind === 'mariadb') {
    return [
      'Variable injectée : MARIADB_URL (alias possible : MYSQL_URL ; certaines apps attendent DATABASE_URL).',
      'Sauvegardes/restauration via l’adaptateur Coolify générique (outils natifs du moteur) lorsque l’instance est compatible. À valider sur votre instance Coolify.',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'Vérifiez régulièrement la restaurabilité dans un environnement isolé avant de considérer une sauvegarde comme garantie.',
    ]
  }
  if (kind === 'mongodb') {
    return [
      'Variable injectée : MONGODB_URL (alias possible : MONGO_URL ; certaines apps attendent DATABASE_URL).',
      'Sauvegardes/restauration via l’adaptateur Coolify générique (outils natifs du moteur, ex. dump) lorsque l’instance est compatible. À valider sur votre instance Coolify.',
      'Copie hors site possible via stockage S3 Coolify si configuré.',
      'Le format et la restaurabilité dépendent du moteur/outillage de l’instance : testez la restauration en environnement isolé.',
    ]
  }
  if (kind === 'clickhouse') {
    return [
      'Variable injectée : CLICKHOUSE_URL.',
      'Base analytique : vérifier le driver/protocole attendu par l’application.',
      'Sauvegardes/restauration intégrées EFLEX non disponibles pour ce moteur (outils natifs requis).',
    ]
  }
  if (kind === 'sqlite') {
    return [
      'Variable injectée : SQLITE_URL (format/chemin dépendant de Coolify et du runtime applicatif).',
      'Moteur expérimental : provisionnement, URL/chemin, persistance et cycle de vie doivent être validés sur l’instance avant usage en production.',
      'Aucune sauvegarde/restauration intégrée EFLEX. Ne pas utiliser comme base critique sans stratégie de sauvegarde validée.',
    ]
  }
  return ['Sauvegardes/restauration intégrées EFLEX non disponibles pour ce moteur (à gérer selon ses outils natifs).']
}

function opCap(
  operation: DatabaseOperation,
  supported: boolean,
  provider: DatabaseProviderKind | null,
  reason?: string,
): DatabaseOperationCapability {
  return reason ? { operation, supported, provider, reason } : { operation, supported, provider }
}

/**
 * Résout les capacités d'un moteur pour une instance Coolify donnée (#183) et applique la
 * politique de sélection de provider (#181). Ne présente comme supporté que ce qui est réellement
 * pris en charge ou explicitement activé.
 */
export function resolveDatabaseEngineCapabilities(
  kind: ManagedDatabaseKind,
  runtime: CoolifyRuntimeCapabilities,
): DatabaseEngineCapabilities {
  const entry = CATALOG_BY_KIND.get(kind)
  if (!entry) {
    const operations = (['provision', 'lifecycle', 'backup', 'restore'] as const).reduce(
      (acc, op) => ({ ...acc, [op]: opCap(op, false, null, 'Moteur inconnu.') }),
      {} as Record<DatabaseOperation, DatabaseOperationCapability>,
    )
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
      maturity: 'unsupported',
      operations,
      selectionPolicy: { preferred: 'coolify', selected: 'coolify', outcome: 'none', reason: 'Moteur inconnu.' },
      probedAt: runtime.checkedAt ?? null,
      probeSource: 'runtime',
    }
  }

  const notes = baseNotes(kind)
  const knownByCoolify = COOLIFY_KNOWN_DB_KINDS.has(kind)
  const maturity = maturityFor(kind)
  const preferred = preferredProviderFor(kind)
  let probeSource: DatabaseEngineCapabilities['probeSource'] = 'runtime'

  if (!runtime.reachable) {
    notes.push('Instance Coolify non joignable : la disponibilité réelle n’a pas pu être vérifiée (les opérations peuvent échouer).')
  } else if (runtime.databaseApiAvailable === false) {
    notes.push('L’API de bases managées Coolify ne semble pas disponible sur cette instance.')
  } else if (runtime.databaseApiAvailable === null) {
    notes.push('Disponibilité de l’API de bases managées non confirmée (sondage incomplet).')
  }

  const apiCompatible = runtime.databaseApiAvailable !== false
  const coolifyDbApiUsable = knownByCoolify && apiCompatible

  // #184 : SQLite et moteurs expérimentaux ne sont pas présentés comme support stable/garanti.
  // SQLite reste non provisionnable par défaut tant qu'il n'est pas explicitement validé sur l'instance.
  let coolifyProvision = coolifyDbApiUsable
  let provisionReason: string | undefined
  let provisionCaveat: string | undefined
  if (!apiCompatible) {
    provisionReason = 'L’API de bases managées n’est pas disponible sur cette instance Coolify.'
  } else if (kind === 'sqlite' && !isExperimentalEnabled('sqlite')) {
    coolifyProvision = false
    provisionReason =
      'SQLite est expérimental : provisionnement non activé par défaut. Validez le comportement sur cette instance puis activez explicitement (EFLEX_DB_EXPERIMENTAL_SQLITE=1) si approprié.'
    notes.push('Activation possible uniquement après validation explicite de l’instance (non recommandé pour une base critique).')
  } else if (kind === 'sqlite') {
    provisionCaveat = 'SQLite activé en mode expérimental (EFLEX_DB_EXPERIMENTAL_SQLITE) : validez URL/persistance/cycle de vie avant usage critique.'
  } else if (maturity === 'experimental') {
    provisionCaveat = 'Moteur expérimental : support dépendant de la version/configuration de l’instance (à valider en conditions réelles).'
    notes.push('Moteur exposé : support dépendant de la version/configuration Coolify (à valider en conditions réelles).')
  }

  let coolifyLifecycle = coolifyProvision || (kind === 'sqlite' && isExperimentalEnabled('sqlite') && coolifyDbApiUsable)
  if (!apiCompatible) coolifyLifecycle = false

  // Sauvegarde/restauration intégrées : PostgreSQL (adapter validé) + moteurs supportés par
  // l'adaptateur Coolify générique (#180) lorsque l'API est compatible. La restaurabilité effective
  // dépend de l'instance/outillage et doit être vérifiée (preuve de restauration).
  const integratedBackup = COOLIFY_GENERIC_BACKUP_KINDS.has(kind) && apiCompatible
  const integratedRestore = COOLIFY_GENERIC_BACKUP_KINDS.has(kind) && apiCompatible

  if (isDisabledByPolicy(kind)) {
    coolifyProvision = false
    coolifyLifecycle = false
    provisionReason = `Le moteur ${entry.label} est désactivé par la configuration de la plateforme.`
    notes.push('Désactivé par politique de plateforme (EFLEX_DB_DISABLE_*).')
    probeSource = 'policy'
  }

  // Provider EFLEX-géré (#181) : sélectionnable par politique comme alternative/fallback contrôlé.
  // Aucun provisionnement/lifecycle/backup intégré EFLEX n'est livré par défaut ici : les opérations
  // restent refusées explicitement tant qu'un adaptateur concret n'est pas activé pour ce moteur.
  const eflexCandidate = preferred === 'eflex' || (!coolifyProvision && preferred === 'coolify')
  let eflexProvision = false
  let eflexLifecycle = false
  let eflexProvisionReason: string | undefined
  if (preferred === 'eflex') {
    eflexProvisionReason =
      'Provider EFLEX-géré sélectionné par politique, mais aucun adaptateur de provisionnement activé pour ce moteur sur cette instance.'
  } else if (!coolifyProvision && eflexCandidate) {
    eflexProvisionReason = 'Aucun provider EFLEX-géré de repli n’est activé pour ce moteur sur cette instance.'
  }

  // Apprentissage réactif (#183) : ajuste les capacités d'après des échecs/réponses observés.
  const learned = getLearnedOverrides(kind)
  let learnedApplied = false
  for (const l of learned) {
    if (l.operation === 'all' || l.operation === 'provision') {
      if (!l.supported) {
        coolifyProvision = false
        eflexProvision = false
        provisionReason = l.reason ?? provisionReason ?? `Le moteur ${entry.label} n’est pas supporté par cette instance.`
      }
      learnedApplied = true
    }
    if (l.operation === 'all' || l.operation === 'lifecycle') {
      if (!l.supported) {
        coolifyLifecycle = false
        eflexLifecycle = false
      }
      learnedApplied = true
    }
  }
  if (learnedApplied) {
    notes.push('Capacité ajustée d’après une réponse observée de l’instance/provider (détection réactive, cache borné).')
    probeSource = probeSource === 'policy' ? 'mixed' : probeSource === 'runtime' ? 'learned' : 'mixed'
  }

  // Sélection finale par opération (politique : provider préféré si capable, sinon alternative capable).
  const pick = (
    operation: DatabaseOperation,
    coolifyOk: boolean,
    eflexOk: boolean,
    defaultReason?: string,
  ): { supported: boolean; provider: DatabaseProviderKind | null; reason?: string } => {
    if (preferred === 'eflex') {
      if (eflexOk) return { supported: true, provider: 'eflex' }
      if (coolifyOk) return { supported: true, provider: 'coolify', reason: 'Provider EFLEX-géré indisponible : repli sur Coolify.' }
      return { supported: false, provider: null, reason: defaultReason ?? eflexProvisionReason ?? provisionReason }
    }
    if (coolifyOk) return { supported: true, provider: 'coolify' }
    if (eflexOk) return { supported: true, provider: 'eflex', reason: 'Coolify indisponible : prise en charge par provider EFLEX-géré.' }
    return { supported: false, provider: null, reason: defaultReason ?? provisionReason }
  }

  const provision = pick('provision', coolifyProvision, eflexProvision, provisionReason)
  const lifecycle = pick(
    'lifecycle',
    coolifyLifecycle,
    eflexLifecycle,
    provision.supported ? (coolifyLifecycle || eflexLifecycle ? provisionCaveat : provisionCaveat) : (provision.reason ?? provisionReason),
  )
  const backup = pick(
    'backup',
    integratedBackup,
    false,
    integratedBackup ? undefined : `Sauvegarde intégrée non disponible pour ${entry.label} (stratégie dédiée requise).`,
  )
  const restore = pick(
    'restore',
    integratedRestore,
    false,
    integratedRestore ? undefined : `Restauration intégrée non disponible pour ${entry.label} (procédure dédiée requise).`,
  )
  if (integratedBackup && kind !== 'postgresql') {
    const caveat = `Sauvegarde via adaptateur Coolify générique : validez la restaurabilité sur cette instance.`
    if (!backup.reason) backup.reason = caveat
    if (!restore.reason) restore.reason = caveat
  }

  // Caveat explicite sur les opérations supportées en mode expérimental (#184).
  if (provision.supported && provisionCaveat && !provision.reason) provision.reason = provisionCaveat
  if (lifecycle.supported && provisionCaveat && !lifecycle.reason) lifecycle.reason = provisionCaveat

  const operations: Record<DatabaseOperation, DatabaseOperationCapability> = {
    provision: opCap('provision', provision.supported, provision.provider, provision.reason),
    lifecycle: opCap('lifecycle', lifecycle.supported, lifecycle.provider, lifecycle.reason),
    backup: opCap('backup', backup.supported, backup.provider, backup.reason),
    restore: opCap('restore', restore.supported, restore.provider, restore.reason),
  }

  const selectedProvider: DatabaseProviderKind =
    provision.provider ?? lifecycle.provider ?? backup.provider ?? restore.provider ?? (preferred === 'eflex' ? 'eflex' : 'coolify')
  const outcome: 'coolify' | 'eflex' | 'none' =
    provision.supported || lifecycle.supported ? (selectedProvider === 'eflex' ? 'eflex' : 'coolify') : 'none'

  let selectionReason: string | undefined
  if (outcome === 'none') selectionReason = provision.reason ?? provisionReason
  else if (preferred === 'eflex' && selectedProvider === 'coolify') selectionReason = provision.reason
  else if (selectedProvider === 'eflex') selectionReason = 'Provider EFLEX-géré sélectionné par politique.'

  // Raison principale agrégée (compatibilité ascendante) : inclut les caveats expérimentaux.
  const primaryReason =
    provision.reason ??
    (!provision.supported ? provisionReason : undefined) ??
    provisionCaveat ??
    lifecycle.reason

  return {
    ...entry,
    provisionSupported: provision.supported,
    lifecycleSupported: lifecycle.supported,
    backupSupported: backup.supported,
    restoreSupported: restore.supported,
    provider: selectedProvider,
    ...(primaryReason ? { reason: primaryReason } : {}),
    notes,
    maturity,
    operations,
    selectionPolicy: {
      preferred,
      selected: selectedProvider,
      outcome,
      ...(selectionReason ? { reason: selectionReason } : {}),
    },
    probedAt: runtime.checkedAt ?? null,
    probeSource,
  }
}

/**
 * Liste les capacités par moteur pour l’instance courante (#183).
 * `force` invalide les apprentissages réactifs locaux et force un nouveau sondage runtime.
 */
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
