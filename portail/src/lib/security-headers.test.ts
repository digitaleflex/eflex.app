import { describe, expect, it } from 'vitest'

import {
  CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_HEADER,
  securityHeaders,
  securityHeadersConfig,
} from './security-headers.mjs'

/** Retourne la valeur d'un en-tête, ou `undefined` s'il est absent. */
function valueOf(headers: { key: string; value: string }[], key: string): string | undefined {
  return headers.find((header) => header.key === key)?.value
}

describe('en-têtes de sécurité', () => {
  it('envoie HSTS uniquement en production', () => {
    const prod = securityHeaders({ production: true })
    expect(valueOf(prod, 'Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload')

    const dev = securityHeaders({ production: false })
    expect(valueOf(dev, 'Strict-Transport-Security')).toBeUndefined()
  })

  it('applique les en-têtes de durcissement de base', () => {
    const headers = securityHeaders({ production: true })
    expect(valueOf(headers, 'X-Content-Type-Options')).toBe('nosniff')
    expect(valueOf(headers, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(valueOf(headers, 'X-Frame-Options')).toBe('DENY')
    expect(valueOf(headers, 'Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(valueOf(headers, 'Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(self)',
    )
  })

  it('sert la CSP en Report-Only, jamais en mode bloquant', () => {
    const headers = securityHeaders({ production: true })
    expect(valueOf(headers, CONTENT_SECURITY_POLICY_HEADER)).toBe(CONTENT_SECURITY_POLICY)
    // Aucun en-tête `Content-Security-Policy` (enforce) tant que la politique
    // n'a pas été validée.
    expect(headers.some((header) => header.key === 'Content-Security-Policy')).toBe(false)
  })

  it('autorise les tiers réellement chargés côté client', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain('https://challenges.cloudflare.com')
    expect(CONTENT_SECURITY_POLICY).toContain('https://cdn.kkiapay.me')
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'")
    // Le SSE et les webhooks sont same-origin.
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'")
  })

  it('couvre toutes les routes, y compris webhooks et SSE', () => {
    const config = securityHeadersConfig({ production: true })
    expect(config).toHaveLength(1)
    expect(config[0].source).toBe('/(.*)')
    expect(config[0].headers.length).toBeGreaterThan(0)
  })
})
