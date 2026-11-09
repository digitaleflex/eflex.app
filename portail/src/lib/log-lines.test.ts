import { describe, expect, it } from 'vitest'
import { maskSecrets, parseLogs } from '@/lib/log-lines'
import { formatEvent } from '@/lib/sse'

describe('parseLogs', () => {
  it('lit le JSON de Coolify, écarte les entrées cachées et numérote chaque ligne', () => {
    const logs = JSON.stringify([
      { output: 'Cloning repo\nInstalling', timestamp: '2026-11-08T10:00:00Z' },
      { output: 'détail interne', hidden: true },
      { output: '', timestamp: 'x' },
      { output: 'Build done' },
    ])
    expect(parseLogs(logs)).toEqual([
      { n: 0, text: 'Cloning repo', ts: '2026-11-08T10:00:00Z' },
      { n: 1, text: 'Installing', ts: '2026-11-08T10:00:00Z' },
      { n: 2, text: 'Build done' },
    ])
  })

  it('accepte du texte brut et rend [] sans journal', () => {
    expect(parseLogs('a\n\nb ').map((l) => l.text)).toEqual(['a', 'b'])
    expect(parseLogs(undefined)).toEqual([])
    expect(parseLogs('[]')).toEqual([])
  })

  it('garde un rang stable quand le journal s’allonge (sert de curseur de reprise)', () => {
    const first = parseLogs(JSON.stringify([{ output: 'a' }, { output: 'b' }]))
    const later = parseLogs(JSON.stringify([{ output: 'a' }, { output: 'b' }, { output: 'c' }]))
    expect(later.slice(0, first.length)).toEqual(first)
    expect(later.filter((l) => l.n >= first.length).map((l) => l.text)).toEqual(['c'])
  })
})

describe('maskSecrets', () => {
  it('masque les secrets, les plus longs d’abord, ignore les valeurs trop courtes', () => {
    const text = 'DB=postgres://u:abcd1234@h/db key=abcd1234 mode=on'
    expect(maskSecrets(text, ['abcd1234', 'postgres://u:abcd1234@h/db', 'on', ''])).toBe('DB=*** key=*** mode=on')
  })
})

describe('formatEvent', () => {
  it('formate id, événement et données multilignes', () => {
    expect(formatEvent('log', 'a\nb', 7)).toBe('id: 7\nevent: log\ndata: a\ndata: b\n\n')
    expect(formatEvent('status', { s: 1 })).toBe('event: status\ndata: {"s":1}\n\n')
  })
})
