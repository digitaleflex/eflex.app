import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_PUBLIC_KEY_PREFIX,
  analyticsConfigUpdateSchema,
  buildAnalyticsSnippet,
  collectPayloadSchema,
  generateAnalyticsPublicKey,
  hasDoNotTrackSignal,
  isAnalyticsPublicKey,
  normalizeAnalyticsPath,
  utcDay,
} from './analytics'

describe('generateAnalyticsPublicKey', () => {
  it('génère une clé publique préfixée et reconnaissable', () => {
    const key = generateAnalyticsPublicKey()
    expect(key.startsWith(ANALYTICS_PUBLIC_KEY_PREFIX)).toBe(true)
    expect(isAnalyticsPublicKey(key)).toBe(true)
    expect(key.length).toBeGreaterThan(20)
  })

  it('génère des clés distinctes', () => {
    const a = generateAnalyticsPublicKey()
    const b = generateAnalyticsPublicKey()
    expect(a).not.toBe(b)
  })
})

describe('isAnalyticsPublicKey', () => {
  it('accepte une clé valide', () => {
    expect(isAnalyticsPublicKey('efx_pub_abcdefghijklmnopqrstuvwxyz')).toBe(true)
  })

  it('refuse les clés invalides', () => {
    expect(isAnalyticsPublicKey('')).toBe(false)
    expect(isAnalyticsPublicKey('pub_abc')).toBe(false)
    expect(isAnalyticsPublicKey('efx_pub_short')).toBe(false)
    expect(isAnalyticsPublicKey('efx_pub_abc def')).toBe(false)
  })
})

describe('normalizeAnalyticsPath', () => {
  it('normalise un chemin simple', () => {
    expect(normalizeAnalyticsPath('/pricing')).toBe('/pricing')
  })

  it('retire la requête et le fragment', () => {
    expect(normalizeAnalyticsPath('/page?utm=1#top')).toBe('/page')
  })

  it('extrait le chemin d’une URL complète', () => {
    expect(normalizeAnalyticsPath('https://app.example.com/docs/start?x=1')).toBe('/docs/start')
  })

  it('ajoute un slash initial et compacte les doubles slashs', () => {
    expect(normalizeAnalyticsPath('docs//intro')).toBe('/docs/intro')
  })

  it('retombe sur "/" pour les entrées vides ou invalides', () => {
    expect(normalizeAnalyticsPath('')).toBe('/')
    expect(normalizeAnalyticsPath(undefined)).toBe('/')
    expect(normalizeAnalyticsPath(null)).toBe('/')
  })

  it('borne la longueur', () => {
    const long = '/' + 'a'.repeat(600)
    expect(normalizeAnalyticsPath(long).length).toBe(500)
  })
})

describe('hasDoNotTrackSignal', () => {
  it('détecte DNT: 1', () => {
    expect(hasDoNotTrackSignal(new Headers({ dnt: '1' }))).toBe(true)
  })

  it('détecte Sec-GPC: 1', () => {
    expect(hasDoNotTrackSignal(new Headers({ 'sec-gpc': '1' }))).toBe(true)
  })

  it('ne signale rien sans en-tête de refus', () => {
    expect(hasDoNotTrackSignal(new Headers({ dnt: '0' }))).toBe(false)
    expect(hasDoNotTrackSignal(new Headers())).toBe(false)
  })
})

describe('utcDay', () => {
  it('tronque une date à minuit UTC', () => {
    const day = utcDay(new Date('2026-05-12T15:34:56.789Z'))
    expect(day.toISOString()).toBe('2026-05-12T00:00:00.000Z')
  })
})

describe('collectPayloadSchema', () => {
  it('accepte une page vue minimale', () => {
    const parsed = collectPayloadSchema.safeParse({ k: 'efx_pub_abcdefghijklmnopqrstuvwxyz', p: '/accueil' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.t).toBe('pageview')
      expect(parsed.data.p).toBe('/accueil')
    }
  })

  it('refuse une charge utile sans clé', () => {
    expect(collectPayloadSchema.safeParse({ p: '/x' }).success).toBe(false)
  })
})

describe('analyticsConfigUpdateSchema', () => {
  it('refuse un objet vide', () => {
    expect(analyticsConfigUpdateSchema.safeParse({}).success).toBe(false)
  })

  it('accepte une activation et borne la rétention', () => {
    expect(analyticsConfigUpdateSchema.safeParse({ enabled: true }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ retentionDays: 30 }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ retentionDays: 1 }).success).toBe(false)
    expect(analyticsConfigUpdateSchema.safeParse({ retentionDays: 9999 }).success).toBe(false)
  })
})

describe('buildAnalyticsSnippet', () => {
  it('inclut la clé, le point de collecte et un envoi non bloquant', () => {
    const snippet = buildAnalyticsSnippet('efx_pub_testkey123456789012', 'https://eflex.app/api/collect')
    expect(snippet).toContain('<script')
    expect(snippet).toContain('data-eflex-analytics')
    expect(snippet).toContain('efx_pub_testkey123456789012')
    expect(snippet).toContain('https://eflex.app/api/collect')
    expect(snippet).toContain('sendBeacon')
    expect(snippet).toContain('keepalive')
    expect(snippet).toContain('pageview')
  })

  it('échappe les valeurs injectées', () => {
    const snippet = buildAnalyticsSnippet('key"</script>', 'https://x.test/a"b')
    expect(snippet).not.toContain('key"</script><script>')
    expect(snippet).toContain('\\"')
  })
})
