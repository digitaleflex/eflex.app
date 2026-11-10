/**
 * En-têtes de sécurité HTTP du portail, consommés par `next.config.mjs`.
 *
 * Module volontairement en `.mjs` (et non `.ts`) : `next.config.mjs` est chargé
 * par Node avant la compilation Next, il ne peut donc pas importer un module
 * TypeScript. La fonction est pure et testée par `security-headers.test.ts`.
 *
 * Choix de la CSP : elle est servie en **Report-Only**
 * (`Content-Security-Policy-Report-Only`). Une CSP appliquée d'emblée casse
 * facilement des scripts tiers (Turnstile, widget Kkiapay) ou les scripts
 * inline de Next ; en Report-Only le navigateur signale les violations dans la
 * console sans rien bloquer. Pour passer en application réelle :
 *   1. relever les violations en préproduction puis en production (console
 *      navigateur, `report-to` si un collecteur est ajouté) ;
 *   2. corriger les sources manquantes ou remplacer `'unsafe-inline'` par des
 *      nonces Next (`experimental.cspNonce` / middleware) ;
 *   3. renommer l'en-tête en `Content-Security-Policy` (voir
 *      `CONTENT_SECURITY_POLICY_HEADER`).
 *
 * Les domaines autorisés correspondent à ce qui est réellement chargé côté
 * client :
 *   - Cloudflare Turnstile : script, iframe et appels depuis
 *     https://challenges.cloudflare.com (`components/auth/turnstile.tsx`) ;
 *   - Kkiapay : script https://cdn.kkiapay.me/k.js et widget (iframe + appels
 *     API sur *.kkiapay.me) (`components/organization/billing-card.tsx`).
 * FedaPay n'est pas embarqué : le paiement se fait par redirection complète
 * vers son site, donc aucun domaine FedaPay n'est nécessaire dans la CSP.
 *
 * Les webhooks (Resend, GitHub, Kkiapay, FedaPay) et le SSE (`/api/events`,
 * journaux) sont appelés par des serveurs ou via `fetch`/`EventSource` same-
 * origin : ces en-têtes globaux sont sans effet fonctionnel sur eux, et la CSP
 * n'est pas appliquée aux réponses consommées par du code non-navigateur.
 */

/** Nom de l'en-tête CSP. Passer à `Content-Security-Policy` pour appliquer. */
export const CONTENT_SECURITY_POLICY_HEADER = 'Content-Security-Policy-Report-Only'

/**
 * Politique CSP (Report-Only).
 * `'unsafe-inline'` est requis par les scripts inline de Next (bootstrap,
 * script de thème avant peinture) et les styles inline de Next/Tailwind.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.kkiapay.me",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://*.kkiapay.me",
  "frame-src 'self' https://challenges.cloudflare.com https://*.kkiapay.me",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

/**
 * Construit la liste des en-têtes de sécurité.
 *
 * @param {{ production?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders({ production = process.env.NODE_ENV === 'production' } = {}) {
  /** @type {{ key: string, value: string }[]} */
  const headers = []

  // HSTS uniquement en production : en développement (http://localhost) il
  // n'aurait aucun sens et pourrait épingler un hôte local. Les navigateurs
  // ignorent de toute façon HSTS reçu en HTTP.
  if (production) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    })
  }

  headers.push(
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Redondant avec `frame-ancestors 'none'` mais conservé pour les
    // navigateurs qui ne gèrent pas encore CSP niveau frame.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Aucun besoin caméra/micro/géolocalisation ; `payment=(self)` laisse le
    // widget Kkiapay utiliser l'API Payment Request depuis notre origine.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: CONTENT_SECURITY_POLICY_HEADER, value: CONTENT_SECURITY_POLICY },
  )

  return headers
}

/**
 * Configuration `headers()` de Next.js : un seul bloc pour toutes les routes
 * (`/(.*)` couvre aussi les webhooks avec slash final et les flux SSE).
 *
 * @param {{ production?: boolean }} [options]
 * @returns {{ source: string, headers: { key: string, value: string }[] }[]}
 */
export function securityHeadersConfig(options = {}) {
  return [{ source: '/(.*)', headers: securityHeaders(options) }]
}
