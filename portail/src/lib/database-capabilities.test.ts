import { afterEach, describe, expect, it } from 'vitest'
import {
  DATABASE_ENGINE_CATALOG,
  clearLearnedDatabaseCapabilities,
  isManagedDatabaseKind,
  learnDatabaseEngineCapability,
  listDatabaseEngineCapabilities,
  resolveDatabaseEngineCapabilities,
} from '@/lib/database-capabilities'

describe('database-capabilities', () => {
  afterEach(() => {
    clearLearnedDatabaseCapabilities()
    delete process.env.EFLEX_DB_DISABLE_MONGODB
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

  it('résout PostgreSQL avec sauvegarde/restauration intégrées', () => {
    const caps = resolveDatabaseEngineCapabilities('postgresql', {
      version: '4.7.5',
      reachable: true,
      databaseApiAvailable: true,
      checkedAt: Date.now(),
    })
    expect(caps.provisionSupported).toBe(true)
    expect(caps.backupSupported).toBe(true)
    expect(caps.restoreSupported).toBe(true)
    expect(caps.provider).toBe('coolify')
    expect(caps.envKey).toBe('DATABASE_URL')
  })

  it('résout Redis sans sauvegarde intégrée', () => {
    const caps = resolveDatabaseEngineCapabilities('redis', {
      version: null,
      reachable: true,
      databaseApiAvailable: true,
      checkedAt: Date.now(),
    })
    expect(caps.provisionSupported).toBe(true)
    expect(caps.backupSupported).toBe(false)
    expect(caps.restoreSupported).toBe(false)
  })

  it('liste les capacités moteur (runtime best-effort)', async () => {
    const result = await listDatabaseEngineCapabilities()
    expect(result.engines).toHaveLength(9)
    expect(result.engines.find((engine) => engine.kind === 'postgresql')?.backupSupported).toBe(true)
    expect(result.engines.find((engine) => engine.kind === 'mysql')?.backupSupported).toBe(false)
  })

  it('refuse le provisionnement si l’API bases managées est indisponible', () => {
    const caps = resolveDatabaseEngineCapabilities('postgresql', {
      version: '4.0.0',
      reachable: true,
      databaseApiAvailable: false,
      checkedAt: Date.now(),
    })
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toContain('API de bases managées')
  })


  it('applique un apprentissage réactif (moteur non supporté)', () => {
    learnDatabaseEngineCapability('mysql', { provisionSupported: false, reason: 'MySQL indisponible.' })
    const caps = resolveDatabaseEngineCapabilities('mysql', {
      version: '4.7.5',
      reachable: true,
      databaseApiAvailable: true,
      checkedAt: Date.now(),
    })
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toBe('MySQL indisponible.')
  })

  it('respecte la désactivation par politique de plateforme', () => {
    process.env.EFLEX_DB_DISABLE_MONGODB = '1'
    const caps = resolveDatabaseEngineCapabilities('mongodb', {
      version: '4.7.5',
      reachable: true,
      databaseApiAvailable: true,
      checkedAt: Date.now(),
    })
    expect(caps.provisionSupported).toBe(false)
    expect(caps.reason).toContain('désactivé')
  })

})
