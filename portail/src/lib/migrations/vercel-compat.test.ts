import { describe, expect, it } from 'vitest'
import { analyzeVercelCompat } from './vercel-compat'

describe('analyzeVercelCompat', () => {
  it('signale les crons comme à reconfigurer, jamais ignorés', () => {
    const r = analyzeVercelCompat({ crons: [{ path: '/api/x', schedule: '0 * * * *' }] })
    expect(r.findings).toEqual([expect.objectContaining({ rule: 'crons', level: 'reconfigure' })])
    expect(r.counts.reconfigure).toBe(1)
  })

  it('refuse explicitement les services Vercel sans équivalent', () => {
    const r = analyzeVercelCompat({}, ['next', '@vercel/kv', '@vercel/blob', '@vercel/postgres'])
    expect(r.findings.map((f) => f.rule).sort()).toEqual(['dep-blob', 'dep-kv', 'dep-postgres'])
    expect(r.counts.unsupported).toBe(3)
  })

  it('marque le format v2 builds/routes comme non pris en charge', () => {
    expect(analyzeVercelCompat({ builds: [{ src: 'a' }] }).findings[0]).toMatchObject({ rule: 'legacy-builds', level: 'unsupported' })
  })

  it('liste les clés inconnues au lieu de les taire', () => {
    expect(analyzeVercelCompat({ framework: 'nextjs', monInvention: true, autre: 1 }).unknown).toEqual(['monInvention', 'autre'])
  })

  it('un projet Next.js simple n’a rien à signaler', () => {
    const r = analyzeVercelCompat({ framework: 'nextjs' }, ['next', 'react'])
    expect(r.findings).toEqual([])
    expect(r.counts).toEqual({ ok: 0, reconfigure: 0, unsupported: 0 })
  })

  it('tolère une entrée absente ou invalide', () => {
    expect(analyzeVercelCompat(null).findings).toEqual([])
    expect(analyzeVercelCompat('texte', []).unknown).toEqual([])
    expect(analyzeVercelCompat([1, 2]).unknown).toEqual([])
  })
})
