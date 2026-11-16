import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_PUBLIC_KEY_PREFIX,
  analyticsConfigUpdateSchema,
  analyticsRetentionCutoff,
  analyticsVisitorDayKey,
  analyticsVisitorHash,
  buildAnalyticsEventSnippet,
  buildAnalyticsSnippet,
  clampRetentionDays,
  collectPayloadSchema,
  generateAnalyticsPublicKey,
  hasDoNotTrackSignal,
  isAnalyticsPublicKey,
  normalizeAnalyticsCountry,
  normalizeAnalyticsEventName,
  normalizeAnalyticsPath,
  normalizeAnalyticsReferrer,
  normalizeAnalyticsUtmValue,
  normalizeGoalEvents,
  parseAnalyticsUserAgent,
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

describe('normalizeAnalyticsEventName', () => {
  it('normalise un nom valide en minuscules', () => {
    expect(normalizeAnalyticsEventName('Signup_Click')).toBe('signup_click')
    expect(normalizeAnalyticsEventName(' achat:valide ')).toBe('achat:valide')
  })

  it('refuse les noms invalides ou sensibles/libres', () => {
    expect(normalizeAnalyticsEventName('')).toBeNull()
    expect(normalizeAnalyticsEventName('   ')).toBeNull()
    expect(normalizeAnalyticsEventName('bad name')).toBeNull()
    expect(normalizeAnalyticsEventName('été')).toBeNull()
    expect(normalizeAnalyticsEventName('a'.repeat(65))).toBeNull()
    expect(normalizeAnalyticsEventName(undefined)).toBeNull()
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

  it('accepte un référent sur une page vue', () => {
    const parsed = collectPayloadSchema.safeParse({
      k: 'efx_pub_abcdefghijklmnopqrstuvwxyz',
      p: '/accueil',
      r: 'https://www.google.com/search?q=eflex',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.r).toContain('google')
  })

  it('accepte des paramètres UTM sur une page vue', () => {
    const parsed = collectPayloadSchema.safeParse({
      k: 'efx_pub_abcdefghijklmnopqrstuvwxyz',
      p: '/landing',
      us: 'google',
      um: 'cpc',
      uc: 'spring_sale',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.us).toBe('google')
  })

  it('accepte un événement nommé sans propriété', () => {
    const parsed = collectPayloadSchema.safeParse({ k: 'efx_pub_abcdefghijklmnopqrstuvwxyz', t: 'event', n: 'signup' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.t).toBe('event')
      expect(parsed.data.n).toBe('signup')
    }
  })

  it('refuse un événement nommé invalide ou sans nom', () => {
    expect(collectPayloadSchema.safeParse({ k: 'efx_pub_abcdefghijklmnopqrstuvwxyz', t: 'event' }).success).toBe(false)
    expect(
      collectPayloadSchema.safeParse({ k: 'efx_pub_abcdefghijklmnopqrstuvwxyz', t: 'event', n: 'bad name' }).success,
    ).toBe(false)
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

  it('accepte les réglages de collecte référent, appareil, pays et UTM', () => {
    expect(analyticsConfigUpdateSchema.safeParse({ collectReferrer: false }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ collectDevice: true }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ collectCountry: false }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ collectUtm: false }).success).toBe(true)
  })

  it('accepte des objectifs de conversion bornés et validés', () => {
    expect(analyticsConfigUpdateSchema.safeParse({ goalEvents: ['signup', 'purchase'] }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ goalEvents: [] }).success).toBe(true)
    expect(analyticsConfigUpdateSchema.safeParse({ goalEvents: ['bad name'] }).success).toBe(false)
    expect(analyticsConfigUpdateSchema.safeParse({ goalEvents: Array(21).fill('a') }).success).toBe(false)
  })
})

describe('buildAnalyticsSnippet', () => {
  it('inclut la clé, le point de collecte, le référent, les UTM et un envoi non bloquant', () => {
    const snippet = buildAnalyticsSnippet('efx_pub_testkey123456789012', 'https://eflex.app/api/collect')
    expect(snippet).toContain('<script')
    expect(snippet).toContain('data-eflex-analytics')
    expect(snippet).toContain('efx_pub_testkey123456789012')
    expect(snippet).toContain('https://eflex.app/api/collect')
    expect(snippet).toContain('document.referrer')
    expect(snippet).toContain('utm_source')
    expect(snippet).toContain('sendBeacon')
    expect(snippet).toContain('keepalive')
    expect(snippet).toContain('pageview')
  })

  it('échappe les valeurs injectées', () => {
    const snippet = buildAnalyticsSnippet('key"</script>', 'https://x.test/a"b')
    expect(snippet).not.toContain('key"</script><script>')
    expect(snippet).toContain('\\"')
  })

  it('peut conditionner l’envoi à un consentement explicite', () => {
    const snippet = buildAnalyticsSnippet('efx_pub_testkey123456789012', 'https://eflex.app/api/collect', {
      requireConsent: true,
    })
    expect(snippet).toContain('__EFLEX_ANALYTICS_CONSENT')
    expect(snippet).toContain('__eflexTrackPageview')
    expect(snippet).toContain('sendBeacon')
  })

  it('n’impose pas de garde de consentement par défaut', () => {
    const snippet = buildAnalyticsSnippet('efx_pub_testkey123456789012', 'https://eflex.app/api/collect')
    expect(snippet).not.toContain('__EFLEX_ANALYTICS_CONSENT')
  })
})

describe('buildAnalyticsEventSnippet', () => {
  it('génère un helper d’événement nommé sans propriété', () => {
    const snippet = buildAnalyticsEventSnippet('efx_pub_testkey123456789012', 'https://eflex.app/api/collect')
    expect(snippet).toContain('__eflexTrackEvent')
    expect(snippet).toContain('t:"event"')
    expect(snippet).toContain('efx_pub_testkey123456789012')
    expect(snippet).not.toContain('user_id')
    expect(snippet).not.toContain('email')
  })
})

describe('normalizeGoalEvents', () => {
  it('normalise, déduplique et borne les objectifs', () => {
    expect(normalizeGoalEvents(['Signup', 'signup', 'purchase', 'bad name'])).toEqual(['signup', 'purchase'])
  })
})

describe('clampRetentionDays', () => {
  it('borne la rétention dans l’intervalle autorisé', () => {
    expect(clampRetentionDays(90)).toBe(90)
    expect(clampRetentionDays(1)).toBe(7)
    expect(clampRetentionDays(9999)).toBe(365)
    expect(clampRetentionDays(30.9)).toBe(30)
  })
})

describe('analyticsRetentionCutoff', () => {
  it('calcule une date de coupure en jours UTC', () => {
    const now = new Date('2026-05-12T15:00:00.000Z')
    const cutoff = analyticsRetentionCutoff(30, now)
    expect(cutoff.toISOString()).toBe('2026-04-12T00:00:00.000Z')
  })
})

describe('analyticsVisitorDayKey', () => {
  it('formate le jour UTC en YYYY-MM-DD', () => {
    expect(analyticsVisitorDayKey(new Date('2026-11-16T23:59:59.000Z'))).toBe('2026-11-16')
  })
})

describe('analyticsVisitorHash', () => {
  it('retourne une empreinte hex stable pour le même jour, IP et UA', () => {
    const day = new Date('2026-11-16T12:00:00.000Z')
    const a = analyticsVisitorHash(day, '203.0.113.10', 'Mozilla/5.0')
    const b = analyticsVisitorHash(day, '203.0.113.10', 'Mozilla/5.0')
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(a).toBe(b)
  })

  it("change quand l'IP ou le UA change", () => {
    const day = new Date('2026-11-16T12:00:00.000Z')
    const base = analyticsVisitorHash(day, '203.0.113.10', 'Mozilla/5.0')
    expect(analyticsVisitorHash(day, '203.0.113.11', 'Mozilla/5.0')).not.toBe(base)
    expect(analyticsVisitorHash(day, '203.0.113.10', 'curl/8')).not.toBe(base)
  })

  it("change d'un jour UTC à l'autre pour le même visiteur (sel rotatif)", () => {
    const a = analyticsVisitorHash(new Date('2026-11-16T10:00:00.000Z'), '203.0.113.10', 'Mozilla/5.0')
    const b = analyticsVisitorHash(new Date('2026-11-17T10:00:00.000Z'), '203.0.113.10', 'Mozilla/5.0')
    expect(a).not.toBe(b)
  })
})

describe('normalizeAnalyticsReferrer', () => {
  it('retourne direct si absent ou vide', () => {
    expect(normalizeAnalyticsReferrer('')).toBe('direct')
    expect(normalizeAnalyticsReferrer(undefined)).toBe('direct')
    expect(normalizeAnalyticsReferrer(null)).toBe('direct')
  })

  it("extrait le domaine d'une URL référente", () => {
    expect(normalizeAnalyticsReferrer('https://www.google.com/search?q=eflex')).toBe('www.google.com')
  })

  it('normalise en minuscules', () => {
    expect(normalizeAnalyticsReferrer('HTTPS://NEWS.YCOMBINATOR.COM/item?id=1')).toBe('news.ycombinator.com')
  })
})

describe('parseAnalyticsUserAgent', () => {
  it('détecte mobile iOS Safari', () => {
    const r = parseAnalyticsUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(r.device).toBe('mobile')
    expect(r.os).toBe('iOS')
    expect(r.browser).toBe('Safari')
  })

  it('détecte desktop Chrome Windows', () => {
    const r = parseAnalyticsUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )
    expect(r.device).toBe('desktop')
    expect(r.os).toBe('Windows')
    expect(r.browser).toBe('Chrome')
  })

  it('retombe sur des valeurs bornées si inconnu', () => {
    const r = parseAnalyticsUserAgent('')
    expect(['desktop', 'mobile', 'tablet', 'other']).toContain(r.device)
    expect(typeof r.browser).toBe('string')
    expect(typeof r.os).toBe('string')
  })
})

describe('normalizeAnalyticsCountry', () => {
  it('normalise un code ISO en majuscules', () => {
    expect(normalizeAnalyticsCountry('fr')).toBe('FR')
    expect(normalizeAnalyticsCountry('US')).toBe('US')
  })

  it('retombe sur Inconnu si invalide ou absent', () => {
    expect(normalizeAnalyticsCountry('')).toBe('Inconnu')
    expect(normalizeAnalyticsCountry('fra')).toBe('Inconnu')
    expect(normalizeAnalyticsCountry(null)).toBe('Inconnu')
    expect(normalizeAnalyticsCountry(undefined)).toBe('Inconnu')
  })
})

describe('normalizeAnalyticsUtmValue', () => {
  it('normalise et borne une valeur UTM', () => {
    expect(normalizeAnalyticsUtmValue('  Google Ads ')).toBe('google-ads')
    expect(normalizeAnalyticsUtmValue('cpc')).toBe('cpc')
  })

  it('retourne null si vide ou invalide', () => {
    expect(normalizeAnalyticsUtmValue('')).toBeNull()
    expect(normalizeAnalyticsUtmValue('   ')).toBeNull()
    expect(normalizeAnalyticsUtmValue('***')).toBeNull()
    expect(normalizeAnalyticsUtmValue(undefined)).toBeNull()
  })
})
