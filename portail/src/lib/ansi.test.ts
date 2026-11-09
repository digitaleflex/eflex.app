import { describe, expect, it } from 'vitest'
import { parseAnsi, stripAnsi } from '@/lib/ansi'

describe('ansi', () => {
  it('colore, met en gras et réinitialise', () => {
    expect(parseAnsi('\u001b[32mOK\u001b[0m fini')).toEqual([
      { text: 'OK', className: 'text-green-300' },
      { text: ' fini', className: '' },
    ])
    expect(parseAnsi('\u001b[1;31mERREUR\u001b[0m')[0]).toEqual({ text: 'ERREUR', className: 'text-red-300 font-semibold' })
  })
  it('ignore les séquences de curseur et ne perd aucun texte', () => {
    const line = 'a\u001b[2Kb\u001b[1Gc'
    expect(parseAnsi(line).map((s) => s.text).join('')).toBe('abc')
    expect(stripAnsi('\u001b[31mrouge\u001b[0m')).toBe('rouge')
  })
  it('rend un segment vide pour une ligne vide', () => {
    expect(parseAnsi('')).toEqual([{ text: '', className: '' }])
  })
})
