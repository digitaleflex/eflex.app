import { describe, expect, it } from 'vitest'
import { parseRepo, repoLabel } from '@/lib/repo'

describe('repo', () => {
  it('lit les URL GitHub usuelles', () => {
    expect(parseRepo('https://github.com/awa/boutique')).toEqual({ owner: 'awa', name: 'boutique' })
    expect(parseRepo('https://github.com/awa/boutique.git')).toEqual({ owner: 'awa', name: 'boutique' })
    expect(parseRepo('https://www.github.com/awa/boutique/')).toEqual({ owner: 'awa', name: 'boutique' })
    expect(parseRepo('https://gitlab.com/awa/boutique')).toBeNull()
  })
  it('donne un libellé court', () => {
    expect(repoLabel('https://github.com/awa/boutique')).toBe('awa/boutique')
    expect(repoLabel('https://git.exemple.fr/x/y')).toBe('git.exemple.fr/x/y')
  })
})
