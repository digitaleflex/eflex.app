import { randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * Socle initial de collecte de trafic (ANALYTICS-2).
 *
 * Principes (voir #112, confidentialité/consentement) :
 * - désactivé par défaut (opt-in explicite, aucune collecte implicite) ;
 * - minimisation : pas d'adresse IP brute stockée, pas d'identifiant visiteur,
 *   pas de cookie, pas de profilage nominatif ; agrégation quotidienne par chemin ;
 * - respect optionnel de DNT / Global Privacy Control ;
 * - rétention configurable au niveau du schéma (la purge effective relève de #112).
 *
 * Aucune donnée n'est inventée : seules les pages vues réellement reçues via le
 * point d'ingestion public (authentifié par clé d'écriture) sont comptabilisées.
 */

export const ANALYTICS_PUBLIC_KEY_PREFIX = 'efx_pub_'
export const ANALYTICS_PUBLIC_KEY_BYTES = 18
export const ANALYTICS_PATH_MAX = 500
export const ANALYTICS_RETENTION_MIN_DAYS = 7
export const ANALYTICS_RETENTION_MAX_DAYS = 365
export const ANALYTICS_RETENTION_DEFAULT_DAYS = 90

export function generateAnalyticsPublicKey(): string {
  return `${ANALYTICS_PUBLIC_KEY_PREFIX}${randomBytes(ANALYTICS_PUBLIC_KEY_BYTES).toString('base64url')}`
}

export function isAnalyticsPublicKey(value: string): boolean {
  return /^efx_pub_[A-Za-z0-9_-]{20,}$/.test(value)
}

/**
 * Normalise un chemin de page pour l'agrégation : sans origine, requête ni
 * fragment, toujours préfixé par "/", longueur bornée. En cas d'entrée vide ou
 * invalide, retombe sur "/".
 */
export function normalizeAnalyticsPath(input: unknown): string {
  if (typeof input !== 'string') return '/'
  let value = input.trim()
  if (!value) return '/'

  // Accepte une URL complète ou un chemin brut.
  try {
    if (/^https?:\/\//i.test(value)) {
      value = new URL(value).pathname || '/'
    }
  } catch {
    // URL invalide : on traite la valeur comme un chemin brut.
  }

  const cut = value.search(/[?#]/)
  if (cut !== -1) value = value.slice(0, cut)
  if (!value.startsWith('/')) value = `/${value}`
  value = value.replace(/\/{2,}/g, '/')

  try {
    value = decodeURIComponent(value)
  } catch {
    // Encodage invalide : on conserve la forme brute.
  }

  // Retire les caractères de contrôle et borne la longueur (stockage VARCHAR).
  value = value.replace(/[\u0000-\u001f\u007f]/g, '')
  if (value.length > ANALYTICS_PATH_MAX) value = value.slice(0, ANALYTICS_PATH_MAX)
  return value || '/'
}

/** Date UTC tronquée au jour (pour la clé d'agrégation quotidienne). */
export function utcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/** Indique si la requête exprime un refus de suivi (DNT ou GPC). */
export function hasDoNotTrackSignal(headers: Headers): boolean {
  const dnt = headers.get('dnt')
  if (dnt === '1') return true
  const gpc = headers.get('sec-gpc')
  if (gpc === '1') return true
  return false
}

export const analyticsConfigUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    respectDnt: z.boolean().optional(),
    collectPath: z.boolean().optional(),
    retentionDays: z
      .number()
      .int()
      .min(ANALYTICS_RETENTION_MIN_DAYS, `La rétention minimale est de ${ANALYTICS_RETENTION_MIN_DAYS} jours.`)
      .max(ANALYTICS_RETENTION_MAX_DAYS, `La rétention maximale est de ${ANALYTICS_RETENTION_MAX_DAYS} jours.`)
      .optional(),
    regenerateKey: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined ||
      value.respectDnt !== undefined ||
      value.collectPath !== undefined ||
      value.retentionDays !== undefined ||
      value.regenerateKey === true,
    { message: 'Aucune modification fournie.' },
  )

export type AnalyticsConfigUpdate = z.infer<typeof analyticsConfigUpdateSchema>

export const collectPayloadSchema = z.object({
  /** Clé publique d'écriture du projet. */
  k: z.string().min(1).max(200),
  /** Chemin ou URL de la page vue. */
  p: z.string().max(2048).optional().default('/'),
  /** Type d'événement (réservé ; seule la page vue est comptée). */
  t: z.enum(['pageview']).optional().default('pageview'),
})

export type CollectPayload = z.infer<typeof collectPayloadSchema>

export interface AnalyticsConfigShape {
  enabled: boolean
  publicKey: string
  respectDnt: boolean
  collectPath: boolean
  retentionDays: number
}

/**
 * Génère un extrait d'intégration minimal (sans cookie, sans identifiant).
 * L'envoi est non bloquant (sendBeacon/fetch keepalive) et ignore les erreurs.
 */
export function buildAnalyticsSnippet(publicKey: string, collectUrl: string): string {
  const safeKey = JSON.stringify(publicKey)
  const safeUrl = JSON.stringify(collectUrl)
  const body =
    `(()=>{try{var d={k:${safeKey},p:location.pathname,t:"pageview"};` +
    `var b=JSON.stringify(d);` +
    `(navigator.sendBeacon&&navigator.sendBeacon(${safeUrl},new Blob([b],{type:"application/json"})))||` +
    `fetch(${safeUrl},{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true,mode:"cors"})` +
    `}catch(_){}})();`
  return `<script defer data-eflex-analytics>${body}</script>`
}

/** Première issue Zod lisible (cohérent avec project-settings.ts). */
export function firstAnalyticsIssue(error: z.ZodError, fallback = 'Données invalides.'): string {
  return error.issues[0]?.message ?? fallback
}
