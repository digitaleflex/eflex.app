/**
 * Règles Cache-Control du portail, consommées par `next.config.mjs`.
 *
 * Module en `.mjs` (comme `security-headers.mjs`) car `next.config.mjs` est
 * chargé par Node avant la compilation Next. Fonctions pures testées par
 * `cache-headers.test.ts`.
 */

/** Pages publiques connues (pré-rendues ou accessibles sans session). */
export const PUBLIC_PAGE_PATHS = [
  '/',
  '/tarifs',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/status',
  '/maintenance',
  '/conditions',
  '/confidentialite',
  '/mentions-legales',
  '/robots.txt',
  '/sitemap.xml',
]

/** Assets publics (logos/images) servis depuis `public/` avec un nom stable. */
export const PUBLIC_STATIC_ASSET_PATHS = [
  '/logos/:path*',
  '/logo-horizontal.png',
  '/logo-horizontal.webp',
  '/logo-mark.png',
]

export const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'
export const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store'
export const PUBLIC_PAGE_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

/**
 * Règles de cache spécifiques (sans les en-têtes de sécurité).
 *
 * @returns {{ source: string, headers: { key: string, value: string }[] }[]}
 */
export function cacheHeadersConfig() {
  return [
    ...PUBLIC_STATIC_ASSET_PATHS.map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE_CONTROL }],
    })),
    {
      source: '/api/:path*',
      headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE_CACHE_CONTROL }],
    },
    {
      source: '/dashboard/:path*',
      headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE_CACHE_CONTROL }],
    },
    ...PUBLIC_PAGE_PATHS.map((path) => ({
      source: path,
      headers: [{ key: 'Cache-Control', value: PUBLIC_PAGE_CACHE_CONTROL }],
    })),
  ]
}
