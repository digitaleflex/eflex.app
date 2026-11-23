/**
 * Validation côté E-FLEX de la configuration avancée d'une application (limites de ressources, contrôle de
 * santé, chemins surveillés) avant tout envoi à Coolify.
 *
 * Pourquoi : ces valeurs viennent du client. Sans contrôle, un client pouvait retirer ou gonfler ses limites
 * de mémoire et de processeur (au détriment des autres clients du serveur et du plan choisi) et passer des
 * chaînes libres au contrôle de santé, que Coolify exécute dans un conteneur. Audit de sécurité 2026-11, N1 et N4.
 *
 * Les plafonds ci-dessous sont des **garde-fous globaux** réglables par variable d'environnement. Ils seront
 * remplacés par des profils par plan (ticket #131).
 */

export interface ResourceCaps {
  /** Mémoire maximale par application, en Mo. */
  maxMemoryMb: number
  /** Processeurs maximum par application. */
  maxCpus: number
}

const intFromEnv = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const value = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

const floatFromEnv = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const value = Number.parseFloat(raw ?? '')
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

/**
 * Plafonds par plan (issue #131). `APP_LIMIT_MAX_MEMORY_MB` / `APP_LIMIT_MAX_CPUS`, quand ils sont définis,
 * restent un plafond global que l'opérateur peut imposer au-dessus de tous les plans.
 */
export const PLAN_RESOURCE_CAPS: Record<'free' | 'starter' | 'pro' | 'agency', ResourceCaps> = {
  free: { maxMemoryMb: 512, maxCpus: 0.5 },
  starter: { maxMemoryMb: 1024, maxCpus: 1 },
  pro: { maxMemoryMb: 2048, maxCpus: 2 },
  agency: { maxMemoryMb: 4096, maxCpus: 4 },
}

export function resourceCapsForPlan(
  planId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): ResourceCaps {
  const plan = PLAN_RESOURCE_CAPS[(planId as keyof typeof PLAN_RESOURCE_CAPS) ?? 'free'] ?? PLAN_RESOURCE_CAPS.free
  const global = resourceCaps(env)
  return {
    maxMemoryMb: env.APP_LIMIT_MAX_MEMORY_MB ? Math.min(plan.maxMemoryMb, global.maxMemoryMb) : plan.maxMemoryMb,
    maxCpus: env.APP_LIMIT_MAX_CPUS ? Math.min(plan.maxCpus, global.maxCpus) : plan.maxCpus,
  }
}

export function resourceCaps(env: Record<string, string | undefined> = process.env): ResourceCaps {
  return {
    maxMemoryMb: intFromEnv(env.APP_LIMIT_MAX_MEMORY_MB, 2048, 64, 1_048_576),
    maxCpus: floatFromEnv(env.APP_LIMIT_MAX_CPUS, 2, 0.1, 256),
  }
}

/** « 512m », « 1g », « 1.5G », « 256 » (octets si sans unité, comme Docker). Renvoie des Mo, ou `null` si invalide. */
export function parseMemoryMb(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([bkmg]?)b?$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = (match[2] ?? '').toLowerCase()
  const factor = unit === 'g' ? 1024 : unit === 'm' ? 1 : unit === 'k' ? 1 / 1024 : 1 / (1024 * 1024)
  return amount * factor
}

export type LimitField = 'limitsCpus' | 'limitsMemory' | 'limitsMemorySwap' | 'limitsMemoryReservation'

export type LimitResult =
  | { kind: 'omit' } // vide ou « 0 » (= sans limite) : jamais envoyé, le client ne peut pas retirer une limite
  | { kind: 'keep'; value: string }
  | { kind: 'error'; message: string }

const LIMIT_LABELS: Record<LimitField, string> = {
  limitsCpus: 'Processeurs',
  limitsMemory: 'Mémoire',
  limitsMemorySwap: 'Mémoire d’échange (swap)',
  limitsMemoryReservation: 'Mémoire réservée',
}

/**
 * Contrôle une limite saisie. Les valeurs vides ou nulles sont écartées (elles signifient « sans limite » côté
 * Docker). Le swap Docker (`memory-swap`) inclut la mémoire : son plafond est le double de la mémoire maximale.
 */
export function checkLimit(field: LimitField, raw: string, caps: ResourceCaps = resourceCaps()): LimitResult {
  const value = raw.trim()
  if (value === '' || /^0+(\.0+)?[bkmg]?b?$/i.test(value)) return { kind: 'omit' }
  const label = LIMIT_LABELS[field]

  if (field === 'limitsCpus') {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return { kind: 'error', message: `${label} : nombre attendu (par exemple 0.5 ou 2).` }
    if (Number(value) > caps.maxCpus) return { kind: 'error', message: `${label} : ${caps.maxCpus} au maximum sur cette plateforme.` }
    return { kind: 'keep', value }
  }

  const mb = parseMemoryMb(value)
  if (mb === null) return { kind: 'error', message: `${label} : format attendu 512m ou 1g.` }
  const max = field === 'limitsMemorySwap' ? caps.maxMemoryMb * 2 : caps.maxMemoryMb
  if (mb > max) return { kind: 'error', message: `${label} : ${max} Mo au maximum sur cette plateforme.` }
  return { kind: 'keep', value }
}

/* ------------------------------------------------------------------ */
/* Contrôle de santé et chemins surveillés                              */
/* ------------------------------------------------------------------ */

export const HEALTH_METHODS = ['GET', 'HEAD', 'POST', 'OPTIONS'] as const

/** Chemin d'URL : commence par « / », caractères d'URL courants uniquement (pas d'espace, de guillemet ni de shell). */
export const HEALTH_PATH_PATTERN = /^\/[A-Za-z0-9._~%/:@+\-=&?,;]*$/
/** Nom d'hôte ou adresse IP, sans port ni schéma. */
export const HEALTH_HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/
/** Texte attendu dans la réponse : pas de caractère de contrôle, de guillemet, d'apostrophe, de « ` », « $ » ou « \ ». */
export const HEALTH_TEXT_PATTERN = /^[^\x00-\x1f"'`$\\]*$/
/** Motif de dossiers surveillés (glob), séparés par des virgules ou des retours à la ligne. */
export const WATCH_PATH_PATTERN = /^[A-Za-z0-9._*?/!{},\[\]@+\- ]*$/

export function validatePort(value: string): boolean {
  if (!/^\d{1,5}$/.test(value)) return false
  const port = Number(value)
  return port >= 1 && port <= 65535
}
