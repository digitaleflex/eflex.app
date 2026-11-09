/** Statuts Coolify considérés comme réussis ou échoués (source unique : worker et flux de journaux). */
export const COOLIFY_LIVE = new Set(['finished', 'success', 'live', 'completed', 'running'])
export const COOLIFY_FAILED = new Set(['failed', 'error', 'cancelled', 'cancelled-by-user'])

/** Statut Coolify → statut du portail (`live`, `failed`, ou `deploying` tant qu'il n'y a pas d'issue). */
export function mapCoolifyStatus(raw: string): 'live' | 'failed' | 'deploying' {
  const value = raw.toLowerCase()
  if (COOLIFY_LIVE.has(value)) return 'live'
  if (COOLIFY_FAILED.has(value)) return 'failed'
  return 'deploying'
}
