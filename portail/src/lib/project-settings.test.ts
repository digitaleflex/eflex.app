import { describe, expect, it } from 'vitest'
import {
  envVarSchema,
  firstIssue,
  projectUpdateSchema,
} from './project-settings'

describe('projectUpdateSchema', () => {
  it('accepte un nom seul et le nettoie', () => {
    const parsed = projectUpdateSchema.safeParse({ name: '  Mon projet  ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual({ name: 'Mon projet' })
  })

  it('accepte une branche avec des séparateurs Git', () => {
    const parsed = projectUpdateSchema.safeParse({ branch: 'feature/refonte-ui' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.branch).toBe('feature/refonte-ui')
  })

  it('refuse une requête sans aucun champ', () => {
    const parsed = projectUpdateSchema.safeParse({})
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe('Aucune modification fournie.')
  })

  it('refuse un nom vide et un nom trop long', () => {
    expect(projectUpdateSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(projectUpdateSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false)
  })

  it('refuse une branche avec espace ou caractère de contrôle', () => {
    expect(projectUpdateSchema.safeParse({ branch: 'ma branche' }).success).toBe(false)
    expect(projectUpdateSchema.safeParse({ branch: 'main\nrm -rf /' }).success).toBe(false)
  })
})

describe('envVarSchema', () => {
  it('accepte une clé valide et une valeur vide', () => {
    const parsed = envVarSchema.safeParse({ key: 'DATABASE_URL', value: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual({ key: 'DATABASE_URL', value: '' })
  })

  it('refuse une clé commençant par un chiffre ou contenant un tiret', () => {
    expect(envVarSchema.safeParse({ key: '1KEY', value: 'x' }).success).toBe(false)
    expect(envVarSchema.safeParse({ key: 'MA-CLE', value: 'x' }).success).toBe(false)
  })

  it('refuse une valeur trop longue', () => {
    expect(envVarSchema.safeParse({ key: 'KEY', value: 'x'.repeat(5_001) }).success).toBe(false)
  })
})
