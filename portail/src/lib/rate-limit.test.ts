import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetRateLimitStateForTests,
  allow,
  allowIp,
  allowMemory,
  allowOrg,
  check,
  checkIp,
  checkMemory,
  checkOrg,
  getClientIp,
  getRateLimitMode,
  rateLimitHeaders,
} from './rate-limit'

describe('getClientIp', () => {
  it('retient l’adresse ajoutée par le proxy (dernière entrée), pas celle envoyée par le client', () => {
    // Le client envoie « 1.1.1.1 » pour se faire passer pour un autre ; Traefik ajoute l'adresse réelle.
    const req = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.1' },
    })
    expect(getClientIp(req)).toBe('203.0.113.1')
    expect(getClientIp(new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.9' } }))).toBe('203.0.113.9')
  })

  it('suit TRUSTED_PROXY_HOPS quand plusieurs proxys de confiance se suivent', () => {
    process.env.TRUSTED_PROXY_HOPS = '2'
    try {
      const req = new Request('https://example.test', { headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.1, 10.0.0.2' } })
      expect(getClientIp(req)).toBe('203.0.113.1')
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS
    }
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

  it('checkMemory expose limite, restant et délai avant réessai', () => {
    const now = 1_700_000_000_000
    const ok = checkMemory('meta', 2, 60_000, now)
    expect(ok).toMatchObject({ allowed: true, limit: 2, remaining: 1, retryAfterSec: 0, mode: 'memory' })
    checkMemory('meta', 2, 60_000, now + 1)
    const refused = checkMemory('meta', 2, 60_000, now + 2)
    expect(refused.allowed).toBe(false)
    expect(refused.remaining).toBe(0)
    expect(refused.retryAfterSec).toBeGreaterThanOrEqual(1)
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

  it('check/checkOrg/checkIp renvoient métadonnées et journalisent les refus sans PII', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = await check('u:1:read', 1, 60_000, { action: 'read', scope: 'user' })
    expect(ok.allowed).toBe(true)
    expect(warn).not.toHaveBeenCalled()

    const refused = await check('u:1:read', 1, 60_000, { action: 'read', scope: 'user' })
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = String(warn.mock.calls[0]?.[0] ?? '')
    expect(logged).toContain('"event":"rate_limit.refused"')
    expect(logged).toContain('"action":"read"')
    expect(logged).toContain('"scope":"user"')
    expect(logged).not.toContain('u:1')

    const org = await checkOrg('org-1', 'projects-list', 1, 60_000)
    expect(org.allowed).toBe(true)
    const req = new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.9' } })
    const ip = await checkIp(req, 'events-stream', 1, 60_000)
    expect(ip.allowed).toBe(true)
    warn.mockRestore()
  })

  it('rateLimitHeaders fournit Retry-After et compteurs', () => {
    const headers = rateLimitHeaders({ allowed: false, limit: 10, remaining: 0, retryAfterSec: 42, resetAt: 1_700_000_060_000 })
    expect(headers['Retry-After']).toBe('42')
    expect(headers['X-RateLimit-Limit']).toBe('10')
    expect(headers['X-RateLimit-Remaining']).toBe('0')
    expect(headers['X-RateLimit-Reset']).toBe('1700000060')
  })
})
