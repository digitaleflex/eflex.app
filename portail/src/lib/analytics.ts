import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'

/**
 * Collecte de trafic agrégée (socle #109, conformité/confidentialité #112).
 *
 * Principes :
 * - désactivée par défaut (opt-in explicite, aucune collecte implicite) ;
 * - minimisation : pas d'adresse IP brute, pas d'identifiant visiteur,
 *   pas de cookie, pas de profilage nominatif, pas de recoupement entre sites ;
 * - agrégation quotidienne par chemin (donnée mesurée reçue par /api/collect) ;
 * - respect optionnel de Do Not Track / Global Privacy Control ;
 * - rétention configurable et bornée, avec purge des statistiques expirées.
 *
 * Le consentement préalable au dépôt/lecture d'informations côté visiteur ou à
 * toute mesure non exemptée relève du responsable du site intégré : le snippet
 * peut être conditionné (voir `buildAnalyticsSnippet`, option `requireConsent`).
 * Aucune donnée n'est inventée : seules les pages vues effectivement reçues sont comptées.
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

export interface AnalyticsSnippetOptions {
  /**
   * Lorsque vrai, le snippet n'émet une page vue que si le site a recueilli un
   * consentement explicite et positionné `window.__EFLEX_ANALYTICS_CONSENT = true`
   * (ou appelé `window.__eflexTrackPageview()` après accord). Sans consentement,
   * aucune requête n'est envoyée. À utiliser lorsque la mesure n'est pas exemptée.
   */
  requireConsent?: boolean
}

/**
 * Extrait d'intégration minimal (sans cookie, sans identifiant, sans recoupement).
 * Envoi non bloquant (sendBeacon/fetch keepalive), erreurs ignorées. Ne lit pas
 * l'URL complète (chemin seul) et ne pose aucun stockage navigateur.
 */
export function buildAnalyticsSnippet(
  publicKey: string,
  collectUrl: string,
  options: AnalyticsSnippetOptions = {},
): string {
  const safeKey = JSON.stringify(publicKey)
  const safeUrl = JSON.stringify(collectUrl)
  const send =
    `var d={k:${safeKey},p:location.pathname,t:"pageview"};` +
    `var b=JSON.stringify(d);` +
    `(navigator.sendBeacon&&navigator.sendBeacon(${safeUrl},new Blob([b],{type:"application/json"})))||` +
    `fetch(${safeUrl},{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true,mode:"cors"})`

  const body = options.requireConsent
    ? `(()=>{try{var s=function(){try{${send}}catch(_){}};` +
      `window.__eflexTrackPageview=s;` +
      `if(window.__EFLEX_ANALYTICS_CONSENT===true)s();` +
      `}catch(_){}})();`
    : `(()=>{try{${send}}catch(_){}})();`

  return `<script defer data-eflex-analytics>${body}</script>`
}

/**
 * Borne de rétention (jours) ramenée à l'intervalle autorisé. Sert aussi de garde
 * avant toute requête de purge pour ne jamais supprimer plus large que prévu.
 */
export function clampRetentionDays(value: number): number {
  if (!Number.isFinite(value)) return ANALYTICS_RETENTION_DEFAULT_DAYS
  return Math.min(ANALYTICS_RETENTION_MAX_DAYS, Math.max(ANALYTICS_RETENTION_MIN_DAYS, Math.trunc(value)))
}

/** Date (UTC, minuit) avant laquelle les statistiques sont considérées expirées. */
export function analyticsRetentionCutoff(retentionDays: number, now = new Date()): Date {
  const days = clampRetentionDays(retentionDays)
  const cutoff = utcDay(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  return cutoff
}

export interface TrafficStatRow {
  date: Date
  path: string
  views: number
}

/**
 * Purge les statistiques quotidiennes d'un projet antérieures à sa rétention.
 * Ne supprime rien si la configuration n'existe pas (aucune donnée collectée).
 * Retourne le nombre de lignes supprimées.
 */
export async function purgeTrafficStatsForProject(
  prisma: Pick<PrismaClient, 'projectAnalytics' | 'trafficDailyStat'>,
  projectId: string,
): Promise<number> {
  const config = await prisma.projectAnalytics.findUnique({
    where: { projectId },
    select: { retentionDays: true },
  })
  if (!config) return 0
  const cutoff = analyticsRetentionCutoff(config.retentionDays)
  const result = await prisma.trafficDailyStat.deleteMany({
    where: { projectId, date: { lt: cutoff } },
  })
  return result.count
}

/** Supprime toutes les statistiques quotidiennes d'un projet (droit à l'effacement des mesures). */
export async function deleteAllTrafficStatsForProject(
  prisma: Pick<PrismaClient, 'trafficDailyStat'>,
  projectId: string,
): Promise<number> {
  const result = await prisma.trafficDailyStat.deleteMany({ where: { projectId } })
  return result.count
}

/** Première issue Zod lisible (cohérent avec project-settings.ts). */
export function firstAnalyticsIssue(error: z.ZodError, fallback = 'Données invalides.'): string {
  return error.issues[0]?.message ?? fallback
}
