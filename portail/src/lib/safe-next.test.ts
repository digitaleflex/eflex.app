import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/safe-next'

describe('safeNext', () => {
  it('accepte les chemins internes', () => {
    expect(safeNext('/invitations/abc')).toBe('/invitations/abc')
    expect(safeNext('/dashboard/projects/1?x=2')).toBe('/dashboard/projects/1?x=2')
  })
  it('refuse les redirections vers un autre site', () => {
    for (const bad of ['https://evil.fr', '//evil.fr', '/\\evil.fr', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNext(bad)).toBe('/dashboard')
    }
  })
})
