import { describe, expect, it } from 'vitest'
import type { ManagedServiceEntry } from './managed-services-catalog'
import {
  buildServicesHubModel,
  matchesServiceQuery,
  runtimeDatabaseApiLabel,
  type EngineInfoView,
  type ManagedDatabaseView,
  type UnifiedService,
} from './services-hub'

const catalog: readonly ManagedServiceEntry[] = [
  { id: 'postgresql', label: 'PostgreSQL', category: 'database', description: 'Base relationnelle', availability: 'available', managedDatabaseKind: 'postgresql', icon: 'postgresql' },
  { id: 'redis', label: 'Redis', category: 'cache', description: 'Cache en mémoire', availability: 'available', managedDatabaseKind: 'redis', icon: 'redis' },
  { id: 'mysql', label: 'MySQL', category: 'database', description: 'Base relationnelle MySQL', availability: 'available', managedDatabaseKind: 'mysql', icon: 'mysql' },
  { id: 'minio', label: 'MinIO', category: 'storage', description: 'Stockage objet S3', availability: 'eflex-managed', icon: 'minio' },
  { id: 'meilisearch', label: 'Meilisearch', category: 'search', description: 'Recherche full-text', availability: 'coolify-oneclick', icon: 'meilisearch' },
  { id: 'qdrant', label: 'Qdrant', category: 'vector', description: 'Base vectorielle', availability: 'planned', icon: 'qdrant' },
]

function db(overrides: Partial<ManagedDatabaseView> & Pick<ManagedDatabaseView, 'id' | 'kind'>): ManagedDatabaseView {
  return {
    id: overrides.id,
    kind: overrides.kind,
    label: overrides.label ?? overrides.kind,
    envKey: overrides.envKey ?? `${overrides.kind.toUpperCase()}_URL`,
    description: overrides.description ?? null,
    status: overrides.status ?? 'running',
    error: overrides.error ?? null,
    createdAt: overrides.createdAt ?? '2026-11-19T10:00:00.000Z',
  }
}

function engine(overrides: Partial<EngineInfoView> & Pick<EngineInfoView, 'kind'>): EngineInfoView {
  return {
    kind: overrides.kind,
    label: overrides.label ?? overrides.kind,
    envKey: overrides.envKey ?? `${overrides.kind.toUpperCase()}_URL`,
    description: overrides.description ?? `${overrides.kind} desc`,
    provisionSupported: overrides.provisionSupported,
    lifecycleSupported: overrides.lifecycleSupported,
    backupSupported: overrides.backupSupported,
    restoreSupported: overrides.restoreSupported,
    provider: overrides.provider,
    notes: overrides.notes,
    reason: overrides.reason,
    created: overrides.created,
    envAliases: overrides.envAliases,
  }
}

function byKey(services: UnifiedService[], key: string): UnifiedService {
  const found = services.find((s) => s.key === key)
  if (!found) throw new Error(`service ${key} introuvable`)
  return found
}

describe('buildServicesHubModel', () => {
  it('fusionne catalogue, moteurs et bases actives sans duplication', () => {
    const model = buildServicesHubModel({
      databases: [db({ id: 'db1', kind: 'postgresql', label: 'PostgreSQL' })],
      engines: [
        engine({ kind: 'postgresql', label: 'PostgreSQL', provisionSupported: true, lifecycleSupported: true, backupSupported: true, restoreSupported: false, provider: 'coolify', envAliases: ['DATABASE_URL'] }),
        engine({ kind: 'redis', label: 'Redis', provisionSupported: true, lifecycleSupported: true }),
      ],
      runtime: { version: '4.0.0', reachable: true, databaseApiAvailable: true, checkedAt: 1 },
      canManage: true,
      catalog,
    })

    expect(model.services.filter((s) => s.key === 'postgresql')).toHaveLength(1)
    const pg = byKey(model.services, 'postgresql')
    expect(pg.state).toBe('active')
    expect(pg.activeDatabase?.id).toBe('db1')
    expect(pg.envAliases).toEqual(['DATABASE_URL'])
    expect(pg.backupSupported).toBe(true)
    expect(pg.created).toBe(true)

    const redis = byKey(model.services, 'redis')
    expect(redis.state).toBe('creatable')
    expect(redis.filterTags).toContain('provisionable')

    expect(byKey(model.services, 'minio').state).toBe('eflex-managed')
    expect(byKey(model.services, 'meilisearch').state).toBe('coolify-oneclick')
    expect(byKey(model.services, 'qdrant').state).toBe('planned')
  })

  it('marque un moteur non provisionnable/lifecycle comme indisponible et propage raison/ajustement', () => {
    const model = buildServicesHubModel({
      databases: [],
      engines: [
        engine({
          kind: 'mysql',
          label: 'MySQL',
          provisionSupported: false,
          lifecycleSupported: true,
          reason: 'Moteur désactivé par la configuration.',
          notes: ['Capacité ajustée par la politique locale.'],
        }),
      ],
      runtime: null,
      canManage: false,
      catalog,
    })

    const mysql = byKey(model.services, 'mysql')
    expect(mysql.state).toBe('unavailable')
    expect(mysql.filterTags).toContain('unavailable')
    expect(mysql.adjusted).toBe(true)
    expect(mysql.reason).toContain('désactivé')
  })

  it('ajoute les moteurs runtime absents du catalogue (défensif)', () => {
    const model = buildServicesHubModel({
      databases: [],
      engines: [engine({ kind: 'clickhouse', label: 'ClickHouse', provisionSupported: true, lifecycleSupported: true })],
      runtime: null,
      canManage: true,
      catalog,
    })

    const ch = byKey(model.services, 'clickhouse')
    expect(ch.state).toBe('creatable')
    expect(ch.category).toBe('database')
    expect(ch.provider).toBe('coolify')
  })

  it('calcule les agrégats de catégories et l’attention', () => {
    const model = buildServicesHubModel({
      databases: [db({ id: 'db1', kind: 'postgresql' })],
      engines: [
        engine({ kind: 'postgresql', provisionSupported: true, lifecycleSupported: true }),
        engine({ kind: 'mysql', provisionSupported: false, lifecycleSupported: false, reason: 'Indisponible' }),
      ],
      runtime: null,
      canManage: true,
      catalog,
    })

    const dbCat = model.categories.find((c) => c.category === 'database')
    expect(dbCat).toBeDefined()
    expect(dbCat!.counts.active).toBe(1)
    expect(dbCat!.counts.unavailable).toBe(1)
    expect(dbCat!.hasAttention).toBe(true)
  })
})

describe('matchesServiceQuery', () => {
  const service = {
    label: 'PostgreSQL',
    description: 'Base relationnelle robuste',
    envKey: 'DATABASE_URL',
    reason: null,
    category: 'database',
    notes: ['Sauvegarde intégrée'],
  } as unknown as UnifiedService

  it('correspond sur label/description/env/notes sans tenir compte des accents et de la casse', () => {
    expect(matchesServiceQuery(service, '')).toBe(true)
    expect(matchesServiceQuery(service, 'postgres')).toBe(true)
    expect(matchesServiceQuery(service, 'RELATIONNELLE')).toBe(true)
    expect(matchesServiceQuery(service, 'database_url')).toBe(true)
    expect(matchesServiceQuery(service, 'sauvegarde integree')).toBe(true)
    expect(matchesServiceQuery(service, 'inexistant')).toBe(false)
  })
})

describe('runtimeDatabaseApiLabel', () => {
  it('retourne le libellé et le ton selon la disponibilité', () => {
    expect(runtimeDatabaseApiLabel({ version: null, reachable: true, databaseApiAvailable: true })).toEqual({ label: 'disponible', tone: 'ok' })
    expect(runtimeDatabaseApiLabel({ version: null, reachable: true, databaseApiAvailable: false })).toEqual({ label: 'indisponible', tone: 'bad' })
    expect(runtimeDatabaseApiLabel({ version: null, reachable: true, databaseApiAvailable: null })).toEqual({ label: 'non confirmée', tone: 'warn' })
    expect(runtimeDatabaseApiLabel(null)).toEqual({ label: 'non confirmée', tone: 'warn' })
  })
})
