import { describe, expect, it } from 'vitest'
import { collectProjectSecretValues, hasPossibleSecret, maskSecrets, parseLogs } from '@/lib/log-lines'

describe('log-lines', () => {
  it('parseLogs numérote les lignes et ignore les entrées cachées', () => {
    const logs = JSON.stringify([
      { output: 'a\nb', timestamp: 't1' },
      { output: 'hidden', hidden: true },
      { output: 'c' },
    ])
    expect(parseLogs(logs)).toEqual([
      { n: 0, text: 'a', ts: 't1' },
      { n: 1, text: 'b', ts: 't1' },
      { n: 2, text: 'c' },
    ])
  })

  it('maskSecrets remplace les secrets les plus longs d’abord', () => {
    expect(maskSecrets('token=abcd1234 abcd', ['abcd', 'abcd1234'])).toBe('token=*** ***')
  })

  it('hasPossibleSecret détecte des motifs courants sans fuite', () => {
    expect(hasPossibleSecret('Bearer abcdefghijklmnopqrstuvwxyz123456')).toBe(true)
    expect(hasPossibleSecret('password=supersecretvalue')).toBe(true)
    expect(hasPossibleSecret('hello world')).toBe(false)
  })

  it('collectProjectSecretValues filtre par application et déchiffre', () => {
    const values = collectProjectSecretValues(
      [
        { key: 'A', value: 'encA', appId: null },
        { key: 'B', value: 'encB', appId: 'app1' },
        { key: 'C', value: 'encC', appId: 'app2' },
      ],
      'p1',
      'app1',
      (v, aad) => `${v}:${aad}`,
    )
    expect(values).toEqual(['encA:p1:A', 'encB:p1:B'])
  })
})
