import { describe, expect, it } from 'vitest'
import { allow, allowOrg } from './rate-limit'

describe('rate-limit', () => {
  it('autorise dans la limite puis bloque la fenêtre', async () => {
    const key = `test:${Math.random().toString(36).slice(2)}`
    expect(await allow(key, 2, 60_000)).toBe(true)
    expect(await allow(key, 2, 60_000)).toBe(true)
    expect(await allow(key, 2, 60_000)).toBe(false)
  })

  it('isole les clés', async () => {
    const a = `a:${Math.random().toString(36).slice(2)}`
    const b = `b:${Math.random().toString(36).slice(2)}`
    expect(await allow(a, 1, 60_000)).toBe(true)
    expect(await allow(b, 1, 60_000)).toBe(true)
    expect(await allow(a, 1, 60_000)).toBe(false)
  })

  it('limite par organisation avec un seau distinct par action', async () => {
    const orgId = `org-${Math.random().toString(36).slice(2)}`
    expect(await allowOrg(orgId, 'analyze', 1, 60_000)).toBe(true)
    expect(await allowOrg(orgId, 'analyze', 1, 60_000)).toBe(false)
    // Une autre action de la même organisation a son propre compteur.
    expect(await allowOrg(orgId, 'create', 1, 60_000)).toBe(true)
    // Une autre organisation n'est pas affectée.
    const other = `org-${Math.random().toString(36).slice(2)}`
    expect(await allowOrg(other, 'analyze', 1, 60_000)).toBe(true)
  })
})
