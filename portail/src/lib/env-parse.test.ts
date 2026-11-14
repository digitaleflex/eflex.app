import { describe, expect, it } from 'vitest'

import { looksLikeEnv, mergeEnvRows, parseEnv, rowsToVars } from '@/lib/env-parse'

const asMap = (text: string) => Object.fromEntries(parseEnv(text).entries.map((e) => [e.key, e.value]))

describe('parseEnv', () => {
  it('lit les affectations simples, avec ou sans export et avec des espaces', () => {
    expect(asMap('A=1\nexport B=deux\n  C  =  trois  \nD=')).toEqual({ A: '1', B: 'deux', C: 'trois', D: '' })
  })

  it('ignore les lignes vides et les commentaires, y compris en fin de ligne', () => {
    const text = '# Base\nDATABASE_URL=postgres://u:p@h/db # prod\n\nURL=https://a.b/#ancre\n'
    expect(asMap(text)).toEqual({ DATABASE_URL: 'postgres://u:p@h/db', URL: 'https://a.b/#ancre' })
  })

  it('respecte les guillemets : simples littéraux, doubles interprétés', () => {
    const text = `A="a b # pas un commentaire"\nB='x\\ny'\nC="x\\ny\\"z\\\\"`
    expect(asMap(text)).toEqual({ A: 'a b # pas un commentaire', B: 'x\\ny', C: 'x\ny"z\\' })
  })

  it('lit une valeur entre guillemets sur plusieurs lignes (clé privée)', () => {
    const text = 'KEY="-----BEGIN-----\nabc\n-----END-----"\nAFTER=1'
    const result = parseEnv(text)
    expect(result.entries.map((e) => e.key)).toEqual(['KEY', 'AFTER'])
    expect(result.entries[0]!.value).toBe('-----BEGIN-----\nabc\n-----END-----')
    expect(result.entries[1]!.line).toBe(4)
    expect(result.invalid).toEqual([])
  })

  it('n’avale pas le fichier si un guillemet n’est jamais fermé', () => {
    const result = parseEnv('A="oups\nB=2')
    expect(result.entries.map((e) => e.key)).toEqual(['A', 'B'])
  })

  it('gère le BOM et les fins de ligne Windows', () => {
    expect(asMap('﻿A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })

  it('garde les références ${VAR} telles quelles et les signes = dans la valeur', () => {
    expect(asMap('A=${B}/x\nTOKEN=abc==')).toEqual({ A: '${B}/x', TOKEN: 'abc==' })
  })

  it('signale les lignes invalides sans bloquer les autres', () => {
    const result = parseEnv('OK=1\nsans egal\n1MAUVAIS=2\n=vide')
    expect(result.entries.map((e) => e.key)).toEqual(['OK'])
    expect(result.invalid.map((i) => i.line)).toEqual([2, 3, 4])
  })

  it('garde la dernière valeur d’un nom en double et les compte', () => {
    const result = parseEnv('A=1\nB=2\nA=3')
    expect(result.entries).toEqual([
      { key: 'B', value: '2', line: 2 },
      { key: 'A', value: '3', line: 3 },
    ])
    expect(result.duplicates).toBe(1)
  })
})

describe('looksLikeEnv', () => {
  it('reconnaît un .env collé, pas un simple nom', () => {
    expect(looksLikeEnv('A=1')).toBe(true)
    expect(looksLikeEnv('export A = 1')).toBe(true)
    expect(looksLikeEnv('A=1\nB=2')).toBe(true)
    expect(looksLikeEnv('DATABASE_URL')).toBe(false)
    expect(looksLikeEnv('')).toBe(false)
    expect(looksLikeEnv('du texte\nsans variable')).toBe(false)
  })
})

describe('mergeEnvRows', () => {
  it('remplit les lignes vides, met à jour les noms connus, ajoute le reste', () => {
    const rows = [
      { key: '', value: '' },
      { key: 'A', value: 'ancien' },
    ]
    const merged = mergeEnvRows(rows, [
      { key: 'B', value: '1' },
      { key: 'A', value: 'nouveau' },
      { key: 'C', value: '3' },
    ])
    expect(merged).toEqual([
      { key: 'B', value: '1' },
      { key: 'A', value: 'nouveau' },
      { key: 'C', value: '3' },
    ])
  })

  it('ne modifie pas la liste d’origine et garde toujours une ligne', () => {
    const rows = [{ key: '', value: '' }]
    mergeEnvRows(rows, [{ key: 'A', value: '1' }])
    expect(rows).toEqual([{ key: '', value: '' }])
    expect(mergeEnvRows([], [])).toEqual([{ key: '', value: '' }])
  })
})

describe('rowsToVars', () => {
  it('écarte les lignes sans nom et dédoublonne (dernière valeur)', () => {
    expect(
      rowsToVars([
        { key: ' A ', value: '1' },
        { key: '', value: 'x' },
        { key: 'B', value: '' },
        { key: 'A', value: '2' },
      ]),
    ).toEqual([
      { key: 'B', value: '' },
      { key: 'A', value: '2' },
    ])
  })
})
