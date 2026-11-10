import { describe, expect, it } from 'vitest'
import { DATABASE_KINDS, isDatabaseKind } from './project-databases'

describe('managed databases', () => {
  it('reconnaît PostgreSQL et Redis', () => {
    expect(isDatabaseKind('postgresql')).toBe(true)
    expect(isDatabaseKind('redis')).toBe(true)
    expect(isDatabaseKind('mysql')).toBe(false)
    expect(isDatabaseKind(null)).toBe(false)
  })

  it('injecte les bonnes variables d’environnement', () => {
    expect(DATABASE_KINDS.postgresql.envKey).toBe('DATABASE_URL')
    expect(DATABASE_KINDS.redis.envKey).toBe('REDIS_URL')
  })
})
