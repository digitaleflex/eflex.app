import { describe, expect, it } from 'vitest'
import { getClientIp } from './rate-limit'

describe('getClientIp', () => {
  it('prend la première IP de x-forwarded-for', () => {
    const req = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('203.0.113.1')
  })

  it('utilise x-real-ip ou cf-connecting-ip en repli', () => {
    expect(getClientIp(new Request('https://example.test', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe('198.51.100.2')
    expect(getClientIp(new Request('https://example.test', { headers: { 'cf-connecting-ip': '198.51.100.3' } }))).toBe('198.51.100.3')
  })

  it('retourne unknown sans en-tête d’IP', () => {
    expect(getClientIp(new Request('https://example.test'))).toBe('unknown')
  })
})
