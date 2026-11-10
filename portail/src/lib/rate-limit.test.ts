import { describe, expect, it } from 'vitest'
import { allow } from './rate-limit'

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
})
