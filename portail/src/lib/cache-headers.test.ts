import { describe, expect, it } from 'vitest'

import {
  PRIVATE_NO_STORE_CACHE_CONTROL,
  PUBLIC_PAGE_CACHE_CONTROL,
  PUBLIC_PAGE_PATHS,
  STATIC_ASSET_CACHE_CONTROL,
  cacheHeadersConfig,
} from './cache-headers.mjs'

function cacheValueFor(config: { source: string; headers: { key: string; value: string }[] }[], source: string) {
  return config.find((rule) => rule.source === source)?.headers.find((h) => h.key === 'Cache-Control')?.value
}

describe('cacheHeadersConfig', () => {
  it('met en cache les logos et images publiques avec revalidation en arrière-plan', () => {
    const config = cacheHeadersConfig()
    expect(cacheValueFor(config, '/logos/:path*')).toBe(STATIC_ASSET_CACHE_CONTROL)
    expect(cacheValueFor(config, '/logo-:path*')).toBe(STATIC_ASSET_CACHE_CONTROL)
  })

  it('désactive le cache pour les données utilisateur (API et tableau de bord)', () => {
    const config = cacheHeadersConfig()
    expect(cacheValueFor(config, '/api/:path*')).toBe(PRIVATE_NO_STORE_CACHE_CONTROL)
    expect(cacheValueFor(config, '/dashboard/:path*')).toBe(PRIVATE_NO_STORE_CACHE_CONTROL)
  })

  it('applique une politique de cache courte et revalidable aux pages publiques connues', () => {
    const config = cacheHeadersConfig()
    for (const path of PUBLIC_PAGE_PATHS) {
      expect(cacheValueFor(config, path)).toBe(PUBLIC_PAGE_CACHE_CONTROL)
    }
  })

  it('inclut les pages publiques principales', () => {
    expect(PUBLIC_PAGE_PATHS).toContain('/')
    expect(PUBLIC_PAGE_PATHS).toContain('/tarifs')
    expect(PUBLIC_PAGE_PATHS).toContain('/login')
    expect(PUBLIC_PAGE_PATHS).toContain('/status')
  })
})
