import { createHmac, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'

/**
 * Collecte de trafic agrégée (socle #109, conformité/confidentialité #112).
 * Incrément #111 (événements nommés / objectifs de conversion) : base minimale,
 * agrégée et sans propriété libre.
 *
 * Principes :
 * - désactivée par défaut (opt-in explicite, aucune collecte implicite) ;
 * - minimisation : pas d'adresse IP brute, pas d'identifiant visiteur,
 *   pas de cookie, pas de profilage nominatif, pas de recoupement entre sites ;
 * - agrégation quotidienne par chemin (pages vues) et par nom d'événement ;
 * - aucun identifiant ni propriété arbitraire stocké pour les événements nommés ;
 * - respect optionnel de Do Not Track / Global Privacy Control ;
 * - rétention configurable et bornée, avec purge des statistiques expirées.
 *
 * Le consentement préalable au dépôt/lecture d'informations côté visiteur ou à
 * toute mesure non exemptée relève du responsable du site intégré : le snippet
 * peut être conditionné (voir `buildAnalyticsSnippet`, option `requireConsent`).
 * Aucune donnée n'est inventée : seules les mesures effectivement reçues sont comptées.
 */

export const ANALYTICS_PUBLIC_KEY_PREFIX = 'efx_pub_'
export const ANALYTICS_PUBLIC_KEY_BYTES = 18
export const ANALYTICS_PATH_MAX = 500
export const ANALYTICS_RETENTION_MIN_DAYS = 7
export const ANALYTICS_RETENTION_MAX_DAYS = 365
export const ANALYTICS_RETENTION_DEFAULT_DAYS = 90

/** Événements nommés (#111) : nom borné, jeu de caractères restreint (pas de contenu libre sensible). */
export const ANALYTICS_EVENT_NAME_MAX = 64
export const ANALYTICS_EVENT_NAME_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/
export const ANALYTICS_GOAL_EVENTS_MAX = 20
/** Plafond explicite du nombre de noms d’événements distincts stockés par projet (toutes périodes). */
export const ANALYTICS_DISTINCT_EVENT_NAMES_MAX = 200

export const ANALYTICS_DIMENSIONS = ['referrer', 'device', 'browser', 'os'] as const
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number]

const REFERRER_DIRECT = 'direct'

export function normalizeAnalyticsReferrer(input: unknown): string {
  if (typeof input !== 'string') return REFERRER_DIRECT
  const raw = input.trim()
  if (!raw) return REFERRER_DIRECT
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`)
    let host = url.hostname.toLowerCase().replace(/\.$/, '')
    host = host.replace(/[\u0000-\u001f\u007f]/g, '')
    if (!host) return REFERRER_DIRECT
    if (host.length > 255) host = host.slice(0, 255)
    return host
  } catch {
    return REFERRER_DIRECT
  }
}

export interface AnalyticsUaInfo {
  device: 'desktop' | 'mobile' | 'tablet' | 'other'
  browser: string
  os: string
}

export function parseAnalyticsUserAgent(ua: string): AnalyticsUaInfo {
  const s = ua || ''
  const isTablet = /ipad|tablet|playbook|silk/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s))
  const isMobile = !isTablet && /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|iemobile/i.test(s)
  const device: AnalyticsUaInfo['device'] = isTablet ? 'tablet' : isMobile ? 'mobile' : s ? 'desktop' : 'other'

  let os = 'Autre'
  if (/windows nt/i.test(s)) os = 'Windows'
  else if (/iphone|ipad|ipod/i.test(s) || /\bios\b/i.test(s)) os = 'iOS'
  else if (/mac os x|macintosh/i.test(s)) os = 'macOS'
  else if (/android/i.test(s)) os = 'Android'
  else if (/cros/i.test(s)) os = 'ChromeOS'
  else if (/linux/i.test(s)) os = 'Linux'

  let browser = 'Autre'
  if (/edg\//i.test(s) || /edgios|edga/i.test(s)) browser = 'Edge'
  else if (/opr\//i.test(s) || /opera/i.test(s)) browser = 'Opera'
  else if (/samsungbrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/firefox|fxios/i.test(s)) browser = 'Firefox'
  else if (/crios/i.test(s)) browser = 'Chrome'
  else if (/chrome\//i.test(s)) browser = 'Chrome'
  else if (/safari/i.test(s)) browser = 'Safari'

  return { device, browser, os }
}

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

/**
 * Normalise un nom d'événement personnalisé (#111). Retourne `null` si le nom
 * est absent, vide ou invalide. Minuscules, caractères sûrs uniquement, longueur
 * bornée : aucune donnée libre/sensible n'est acceptée.
 */
export function normalizeAnalyticsEventName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  if (!value) return null
  if (value.length > ANALYTICS_EVENT_NAME_MAX) return null
  if (!ANALYTICS_EVENT_NAME_PATTERN.test(value)) return null
  return value
}

/** Date UTC tronquée au jour (pour la clé d'agrégation quotidienne). */
export function utcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function analyticsVisitorSecret(): string {
  return (
    process.env.ANALYTICS_VISITOR_SECRET ||
    process.env.ENV_ENCRYPTION_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    'eflex-analytics-dev-secret'
  )
}

export function analyticsVisitorDayKey(date = new Date()): string {
  return utcDay(date).toISOString().slice(0, 10)
}

function analyticsDailySalt(dayKey: string): Buffer {
  return createHmac('sha256', analyticsVisitorSecret()).update(`analytics-visitor:${dayKey}`).digest()
}

/**
 * Empreinte non réversible d'un visiteur pour un jour UTC donné.
 * Entrées : IP et User-Agent tels que vus en mémoire (jamais persistés). Le sel
 * quotidien (dérivé d'un secret serveur) empêche le recoupement entre jours.
 */
export function analyticsVisitorHash(date: Date, ip: string, userAgent: string): string {
  const dayKey = analyticsVisitorDayKey(date)
  const salt = analyticsDailySalt(dayKey)
  return createHmac('sha256', salt).update(`${ip}\0${userAgent}`).digest('hex')
}

/** Indique si la requête exprime un refus de suivi (DNT ou GPC). */
export function hasDoNotTrackSignal(headers: Headers): boolean {
  const dnt = headers.get('dnt')
  if (dnt === '1') return true
  const gpc = headers.get('sec-gpc')
  if (gpc === '1') return true
  return false
}

const goalEventNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ANALYTICS_EVENT_NAME_MAX)
  .regex(ANALYTICS_EVENT_NAME_PATTERN, "Nom d'événement invalide (lettres/chiffres minuscules, . _ : -).")

export const analyticsConfigUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    respectDnt: z.boolean().optional(),
    collectPath: z.boolean().optional(),
    collectReferrer: z.boolean().optional(),
    collectDevice: z.boolean().optional(),
    retentionDays: z
      .number()
      .int()
      .min(ANALYTICS_RETENTION_MIN_DAYS, `La rétention minimale est de ${ANALYTICS_RETENTION_MIN_DAYS} jours.`)
      .max(ANALYTICS_RETENTION_MAX_DAYS, `La rétention maximale est de ${ANALYTICS_RETENTION_MAX_DAYS} jours.`)
      .optional(),
    regenerateKey: z.boolean().optional(),
    /** Objectifs de conversion (#111) : liste bornée de noms d'événements. */
    goalEvents: z
      .array(goalEventNameSchema)
      .max(ANALYTICS_GOAL_EVENTS_MAX, `Au plus ${ANALYTICS_GOAL_EVENTS_MAX} objectifs.`)
      .optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined ||
      value.respectDnt !== undefined ||
      value.collectPath !== undefined ||
      value.collectReferrer !== undefined ||
      value.collectDevice !== undefined ||
      value.retentionDays !== undefined ||
      value.regenerateKey === true ||
      value.goalEvents !== undefined,
    { message: 'Aucune modification fournie.' },
  )

export type AnalyticsConfigUpdate = z.infer<typeof analyticsConfigUpdateSchema>

export const collectPayloadSchema = z
  .object({
    /** Clé publique d'écriture du projet. */
    k: z.string().min(1).max(200),
    /** Chemin ou URL de la page vue (ignoré pour les événements nommés). */
    p: z.string().max(2048).optional().default('/'),
    /** Type : page vue (défaut, rétrocompatibilité) ou événement nommé (#111). */
    t: z.enum(['pageview', 'event']).optional().default('pageview'),
    /** Nom de l'événement nommé, requis si t = "event". */
    n: z.string().max(ANALYTICS_EVENT_NAME_MAX).optional(),
    /** Référent de la page vue (URL ou vide). Ignoré côté serveur pour les événements. */
    r: z.string().max(2048).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.t === 'event' && normalizeAnalyticsEventName(value.n) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['n'],
        message: "Nom d'événement invalide.",
      })
    }
  })

export type CollectPayload = z.infer<typeof collectPayloadSchema>

export interface AnalyticsConfigShape {
  enabled: boolean
  publicKey: string
  respectDnt: boolean
  collectPath: boolean
  retentionDays: number
  goalEvents: string[]
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
    `var r="";try{r=document.referrer||""}catch(_){};` +
    `var d={k:${safeKey},p:location.pathname,t:"pageview",r:r};` +
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
 * Exemple d'envoi d'un événement nommé (#111), sans propriété ni identifiant.
 * Le nom doit respecter le format validé côté serveur (minuscules, chiffres, . _ : -).
 */
export function buildAnalyticsEventSnippet(publicKey: string, collectUrl: string): string {
  const safeKey = JSON.stringify(publicKey)
  const safeUrl = JSON.stringify(collectUrl)
  return [
    '<script>',
    '// Exemple : envoyer un événement nommé (aucune propriété, aucun identifiant).',
    'window.__eflexTrackEvent = function(name){try{',
    `var d={k:${safeKey},t:"event",n:String(name||"")};`,
    'var b=JSON.stringify(d);',
    `(navigator.sendBeacon&&navigator.sendBeacon(${safeUrl},new Blob([b],{type:"application/json"})))||`,
    `fetch(${safeUrl},{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true,mode:"cors"});`,
    '}catch(_){} };',
    '</script>',
  ].join('\n')
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

/** Normalise/déduplique une liste d'objectifs de conversion (bornée). */
export function normalizeGoalEvents(input: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const name = normalizeAnalyticsEventName(raw)
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= ANALYTICS_GOAL_EVENTS_MAX) break
  }
  return out
}

export interface TrafficStatRow {
  date: Date
  path: string
  views: number
}

/**
 * Purge les statistiques quotidiennes d'un projet antérieures à sa rétention
 * (pages vues, totaux site, visiteurs, dimensions et événements nommés). Ne supprime rien
 * si la configuration n'existe pas. Retourne le nombre total de lignes supprimées.
 */
export async function purgeTrafficStatsForProject(
  prisma: Pick<
    PrismaClient,
    | 'projectAnalytics'
    | 'trafficDailyStat'
    | 'trafficDailySiteStat'
    | 'analyticsDailyVisitor'
    | 'analyticsEventDaily'
    | 'trafficDailyDimension'
    | 'analyticsDailyDimensionVisitor'
  >,
  projectId: string,
): Promise<number> {
  const config = await prisma.projectAnalytics.findUnique({
    where: { projectId },
    select: { retentionDays: true },
  })
  if (!config) return 0
  const cutoff = analyticsRetentionCutoff(config.retentionDays)
  const [traffic, site, visitors, events, dimensions, dimVisitors] = await Promise.all([
    prisma.trafficDailyStat.deleteMany({ where: { projectId, date: { lt: cutoff } } }),
    prisma.trafficDailySiteStat.deleteMany({ where: { projectId, date: { lt: cutoff } } }),
    prisma.analyticsDailyVisitor.deleteMany({ where: { projectId, date: { lt: cutoff } } }),
    prisma.analyticsEventDaily.deleteMany({ where: { projectId, date: { lt: cutoff } } }),
    prisma.trafficDailyDimension.deleteMany({ where: { projectId, date: { lt: cutoff } } }),
    prisma.analyticsDailyDimensionVisitor.deleteMany({ where: { projectId, date: { lt: cutoff } } }),
  ])
  return traffic.count + site.count + visitors.count + events.count + dimensions.count + dimVisitors.count
}

/** Supprime toutes les statistiques d'un projet (droit à l'effacement des mesures). */
export async function deleteAllTrafficStatsForProject(
  prisma: Pick<
    PrismaClient,
    | 'trafficDailyStat'
    | 'trafficDailySiteStat'
    | 'analyticsDailyVisitor'
    | 'analyticsEventDaily'
    | 'trafficDailyDimension'
    | 'analyticsDailyDimensionVisitor'
  >,
  projectId: string,
): Promise<number> {
  const [traffic, site, visitors, events, dimensions, dimVisitors] = await Promise.all([
    prisma.trafficDailyStat.deleteMany({ where: { projectId } }),
    prisma.trafficDailySiteStat.deleteMany({ where: { projectId } }),
    prisma.analyticsDailyVisitor.deleteMany({ where: { projectId } }),
    prisma.analyticsEventDaily.deleteMany({ where: { projectId } }),
    prisma.trafficDailyDimension.deleteMany({ where: { projectId } }),
    prisma.analyticsDailyDimensionVisitor.deleteMany({ where: { projectId } }),
  ])
  return traffic.count + site.count + visitors.count + events.count + dimensions.count + dimVisitors.count
}

/** Première issue Zod lisible (cohérent avec project-settings.ts). */
export function firstAnalyticsIssue(error: z.ZodError, fallback = 'Données invalides.'): string {
  return error.issues[0]?.message ?? fallback
}
