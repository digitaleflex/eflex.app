import { describe, expect, it } from 'vitest'
import { isInternalPath, safeNext } from '@/lib/safe-next'

describe('safeNext / isInternalPath', () => {
  it('accepte les chemins internes', () => {
    for (const ok of ['/dashboard', '/invitations/abc', '/dashboard/projects/1?tab=deployments', '/a#ancre']) {
      expect(isInternalPath(ok)).toBe(true)
      expect(safeNext(ok)).toBe(ok)
    }
  })

  it('refuse les redirections vers un autre site, y compris par caractères de contrôle', () => {
    const bad = [
      'https://evil.fr', '//evil.fr', '/\\evil.fr', 'javascript:alert(1)', '', null, undefined, 'dashboard',
      '/\t/evil.fr', '/\n/evil.fr', '/\r/evil.fr', '/\u0000/evil.fr', '/\u007f/evil.fr',
    ]
    for (const value of bad) {
      expect(safeNext(value), JSON.stringify(value)).toBe('/dashboard')
    }
  })

  it('le navigateur normaliserait /\\t/hôte en //hôte : on le vérifie avec l’analyseur d’URL', () => {
    expect(new URL('/\t/evil.fr', 'http://eflex.invalid').host).toBe('evil.fr') // le piège
    expect(isInternalPath('/\t/evil.fr')).toBe(false) // et il est refusé
  })

  it('utilise le repli demandé', () => {
    expect(safeNext('//x', '/accueil')).toBe('/accueil')
  })
})
