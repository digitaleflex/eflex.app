import { describe, expect, it } from 'vitest'
import { DATABASE_KINDS, isDatabaseKind } from './project-databases'

describe('managed databases', () => {
  it('reconnaît les moteurs de bases managées indexés', () => {
    expect(isDatabaseKind('postgresql')).toBe(true)
    expect(isDatabaseKind('redis')).toBe(true)
    expect(isDatabaseKind('mysql')).toBe(true)
    expect(isDatabaseKind('mariadb')).toBe(true)
    expect(isDatabaseKind('mongodb')).toBe(true)
    expect(isDatabaseKind('clickhouse')).toBe(true)
    expect(isDatabaseKind('dragonfly')).toBe(true)
    expect(isDatabaseKind('keydb')).toBe(true)
    expect(isDatabaseKind('sqlite')).toBe(true)
    expect(isDatabaseKind('oracle')).toBe(false)
    expect(isDatabaseKind(null)).toBe(false)
  })

  it('expose les variables d’environnement principales et alias compatibles', () => {
    expect(DATABASE_KINDS.postgresql.envKey).toBe('DATABASE_URL')
    expect(DATABASE_KINDS.postgresql.envAliases).toContain('POSTGRES_URL')
    expect(DATABASE_KINDS.redis.envKey).toBe('REDIS_URL')
    expect(DATABASE_KINDS.redis.envAliases).toContain('CACHE_URL')
    expect(DATABASE_KINDS.mongodb.envAliases).toContain('MONGO_URL')
    expect(DATABASE_KINDS.dragonfly.envAliases).toContain('REDIS_URL')
  })
})
