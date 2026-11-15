import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetRateLimitStateForTests,
  allow,
  allowIp,
  allowMemory,
  allowOrg,
  getClientIp,
  getRateLimitMode,
} from './rate-limit'

describe('getClientIp', () => {
  it('prend la première IP de x-forwarded-for', () => {
    const req = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('203.0.113.1')
  })

  it('utilise x-real-ip ou cf-connecting-ip en repli', () => {
    expect(getClientIp(new Request('https://example.test', { headers: { 'x-real-ip': '198.51.100.2' } }))).toBe(
      '198.51.100.2',
    )
    expect(getClientIp(new Request('https://example.test', { headers: { 'cf-connecting-ip': '198.51.100.3' } }))).toBe(
      '198.51.100.3',
    )
  })

  it('retourne unknown sans en-tête d’IP', () => {
    expect(getClientIp(new Request('https://example.test'))).toBe('unknown')
  })
})

describe('rate-limit (mémoire, sans Redis)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL
    __resetRateLimitStateForTests()
  })

  it('autorise puis refuse au-delà de la limite dans la fenêtre', () => {
    const now = 1_700_000_000_000
    expect(allowMemory('k', 2, 60_000, now)).toBe(true)
    expect(allowMemory('k', 2, 60_000, now + 1)).toBe(true)
    expect(allowMemory('k', 2, 60_000, now + 2)).toBe(false)
  })

  it('réautorise après expiration de la fenêtre', () => {
    const now = 1_700_000_000_000
    expect(allowMemory('k', 1, 1_000, now)).toBe(true)
    expect(allowMemory('k', 1, 1_000, now + 500)).toBe(false)
    expect(allowMemory('k', 1, 1_000, now + 1_001)).toBe(true)
  })

  it('expose le mode mémoire sans REDIS_URL', () => {
    expect(getRateLimitMode()).toBe('memory')
  })

  it('allow/allowOrg/allowIp retombent sur la mémoire sans Redis', async () => {
    expect(await allow('user:1:action', 1, 60_000)).toBe(true)
    expect(await allow('user:1:action', 1, 60_000)).toBe(false)

    expect(await allowOrg('org-1', 'create', 1, 60_000)).toBe(true)
    expect(await allowOrg('org-1', 'create', 1, 60_000)).toBe(false)

    const req = new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.9' } })
    expect(await allowIp(req, 'webhook:test', 1, 60_000)).toBe(true)
    expect(await allowIp(req, 'webhook:test', 1, 60_000)).toBe(false)
  })
})
