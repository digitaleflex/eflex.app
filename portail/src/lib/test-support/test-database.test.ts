import { describe, expect, it } from 'vitest'
import {
  UnsafeTestDatabaseError,
  assertTestDatabase,
  databaseName,
} from './test-database'

describe('garde-fou de base de test', () => {
  it('extrait le nom de la base sans le paramètre schema', () => {
    expect(databaseName('postgresql://eflex:secret@localhost:5432/eflex_test?schema=public')).toBe('eflex_test')
    expect(databaseName('postgresql://eflex:secret@localhost:5432/eflex')).toBe('eflex')
    expect(databaseName(undefined)).toBeNull()
    expect(databaseName('pas-une-url')).toBeNull()
  })

  it('ne fait rien quand les tests d’intégration sont désactivés', () => {
    expect(() => assertTestDatabase('postgresql://x/y', { enabled: false })).not.toThrow()
  })

  it('accepte une base dont le nom contient test', () => {
    expect(() =>
      assertTestDatabase('postgresql://eflex:secret@localhost:5432/eflex_test?schema=public', { enabled: true }),
    ).not.toThrow()
  })

  it('refuse la base de production', () => {
    expect(() =>
      assertTestDatabase('postgresql://eflex:secret@localhost:5432/eflex?schema=public', { enabled: true }),
    ).toThrow(UnsafeTestDatabaseError)
  })

  it('refuse une URL absente ou invalide', () => {
    expect(() => assertTestDatabase(undefined, { enabled: true })).toThrow(UnsafeTestDatabaseError)
    expect(() => assertTestDatabase('pas-une-url', { enabled: true })).toThrow(UnsafeTestDatabaseError)
  })

  it('refuse NODE_ENV=production', () => {
    expect(() =>
      assertTestDatabase('postgresql://eflex:secret@localhost:5432/eflex_test', {
        enabled: true,
        nodeEnv: 'production',
      }),
    ).toThrow(UnsafeTestDatabaseError)
  })
})
