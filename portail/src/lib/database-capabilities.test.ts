import { afterEach, describe, expect, it } from 'vitest'
import {
  DATABASE_ENGINE_CATALOG,
  clearLearnedDatabaseCapabilities,
  isManagedDatabaseKind,
  learnDatabaseEngineCapability,
  listDatabaseEngineCapabilities,
  preferredProviderFor,
  resolveDatabaseEngineCapabilities,
} from '@/lib/database-capabilities'

const runtime = (overrides: Partial<{ version: string | null; reachable: boolean; databaseApiAvailable: boolean | null; checkedAt: number }> = {}) => ({
  version: overrides.version ?? '4.7.5',
  reachable: overrides.reachable ?? true,
  databaseApiAvailable: overrides.databaseApiAvailable ?? true,
  checkedAt: overrides.checkedAt ?? Date.now(),
})

describe('database-capabilities (#183/#184)', () => {
  afterEach(() => {
    clearLearnedDatabaseCapabilities()
    delete process.env.EFLEX_DB_DISABLE_MONGODB
    delete process.env.EFLEX_DB_EXPERIMENTAL_SQLITE
    delete process.env.EFLEX_DB_PROVIDER_POSTGRESQL
    delete process.env.EFLEX_DB_PROVIDER_DEFAULT
  })

  it('expose les 9 moteurs connus du catalogue', () => {
    expect(DATABASE_ENGINE_CATALOG.map((entry) => entry.kind)).toEqual([
      'postgresql',
      'redis',
      'mysql',
      'mariadb',
      'mongodb',
      'clickhouse',
      'dragonfly',
      'keydb',
      'sqlite',
    ])
  })

  it('valide les types de moteurs', () => {
    expect(isManagedDatabaseKind('postgresql')).toBe(true)
    expect(isManagedDatabaseKind('sqlite')).toBe(true)
    expect(isManagedDatabaseKind('oracle')).toBe(false)
    expect(isManagedDatabaseKind(null)).toBe(false)
  })

  it('résout PostgreSQL avec sauvegarde/restauration intégrées et opérations explicites', () => {
    const caps = resolveDatabaseEngineCapabilities('postgresql', runtime())
    expect(caps.provisionSupported).toBe(true)
    expect(caps.backupSupported).toBe(true)
    expect(caps.restoreSupported).toBe(true)
    expect(caps.provider).toBe('coolify')
    expect(caps.envKey).toBe('DATABASE_URL')
    expect(caps.maturity).toBe('stable')
    expect(caps.operations.provision.supported).toBe(true)
    expect(caps.operations.backup.supported).toBe(true)
    expect(caps.operations.restore.supported).toBe(true)
    expect(caps.selectionPolicy.outcome).toBe('coolify')
  })

  it('résout Redis sans sauvegarde/restauration intégrée', () => {
    const caps = resolveDatabaseEngineCapabilities('redis', runtime({ version: null }))
    expect(caps.provisionSupported).toBe(true)
    expect(caps.backupSupported).toBe(false)
    expect(caps.restoreSupported).toBe(false)
    expect(caps.operations.backup.supported).toBe(false)
    expect(caps.operations.backup.reason).toContain('Sauvegarde intégrée non disponible')
  })

  it('liste les capacités moteur (runtime sondé, best-effort)', async () => {
    const result = await listDatabaseEngineCapabilities()
    expect(result.engines).toHaveLength(9)
    expect(result.engines.find((engine) => engine.kind === 'postgresql')?.backupSupported).toBe(true)
    // Les sauvegardes planifiées de Coolify couvrent PostgreSQL, MySQL, MariaDB et MongoDB (#180) ; pas Redis.
    expect(result.engines.find((engine) => engine.kind === 'mysql')?.backupSupported).toBe(true)
    expect(result.engines.find((engine) => engine.kind === 'redis')?.backupSupported).toBe(false)
  })

  it('refuse le provisionnement si l’API bases managées est indisponible', () => {
    const caps = resolveDatabaseEngineCapabilities('postgresql', runtime({ version: '4.0.0', databaseApiAvailable: false }))
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toContain('API de bases managées')
    expect(caps.operations.provision.supported).toBe(false)
  })

  it('applique un apprentissage réactif (moteur/opération non supporté)', () => {
    learnDatabaseEngineCapability('mysql', { provisionSupported: false, reason: 'MySQL indisponible.' })
    const caps = resolveDatabaseEngineCapabilities('mysql', runtime())
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toBe('MySQL indisponible.')
    expect(caps.operations.provision.supported).toBe(false)
  })

  it('respecte la désactivation par politique de plateforme', () => {
    process.env.EFLEX_DB_DISABLE_MONGODB = '1'
    const caps = resolveDatabaseEngineCapabilities('mongodb', runtime())
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toContain('désactivé')
    expect(caps.selectionPolicy.outcome).toBe('none')
  })

  it('marque SQLite comme expérimental et non provisionnable par défaut (#184)', () => {
    const caps = resolveDatabaseEngineCapabilities('sqlite', runtime())
    expect(caps.maturity).toBe('experimental')
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toContain('expérimental')
    expect(caps.operations.provision.supported).toBe(false)
  })

  it('autorise SQLite uniquement après activation expérimentale explicite', () => {
    process.env.EFLEX_DB_EXPERIMENTAL_SQLITE = '1'
    const caps = resolveDatabaseEngineCapabilities('sqlite', runtime())
    expect(caps.provisionSupported).toBe(true)
    expect(caps.maturity).toBe('experimental')
    expect(caps.reason).toContain('expérimental')
  })

  it('applique la politique de provider préférée et refuse explicitement le fallback EFLEX non implémenté (#181)', () => {
    process.env.EFLEX_DB_PROVIDER_POSTGRESQL = 'eflex'
    expect(preferredProviderFor('postgresql')).toBe('eflex')
    const caps = resolveDatabaseEngineCapabilities('postgresql', runtime())
    expect(caps.selectionPolicy.preferred).toBe('eflex')
    // Aucun adaptateur EFLEX concret : repli explicite (pas de faux support).
    expect(caps.operations.provision.provider === 'coolify' || caps.operations.provision.supported === false).toBe(true)
  })
})
