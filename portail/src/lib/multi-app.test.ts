import { describe, expect, it } from 'vitest'
import {
  MULTI_APP_DISABLED_MESSAGE,
  multiAppEnabled,
} from '@/lib/multi-app'

describe('drapeau EFLEX_MULTI_APP', () => {
  it('est désactivé par défaut (variable absente, vide, 0, false)', () => {
    expect(multiAppEnabled({})).toBe(false)
    expect(multiAppEnabled({ EFLEX_MULTI_APP: '' })).toBe(false)
    expect(multiAppEnabled({ EFLEX_MULTI_APP: '0' })).toBe(false)
    expect(multiAppEnabled({ EFLEX_MULTI_APP: 'false' })).toBe(false)
    expect(multiAppEnabled({ EFLEX_MULTI_APP: 'non' })).toBe(false)
  })

  it('est actif avec 1 ou true, sans tenir compte de la casse et des espaces', () => {
    expect(multiAppEnabled({ EFLEX_MULTI_APP: '1' })).toBe(true)
    expect(multiAppEnabled({ EFLEX_MULTI_APP: 'true' })).toBe(true)
    expect(multiAppEnabled({ EFLEX_MULTI_APP: ' TRUE ' })).toBe(true)
  })

  it('fournit un message de refus explicite', () => {
    expect(MULTI_APP_DISABLED_MESSAGE).toContain('désactivé')
    expect(MULTI_APP_DISABLED_MESSAGE).toContain('projet par application')
  })
})
