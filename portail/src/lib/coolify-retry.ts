/**
 * Nouvelle tentative bornée pour les appels Coolify idempotents (audit M2).
 *
 * Seules les lectures (GET/HEAD) sont rejouées : une écriture rejouée à
 * l'aveugle pourrait créer un doublon. Sont réessayés : erreur réseau ou délai
 * dépassé, et les statuts transitoires 429, 502, 503, 504.
 */

export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504])
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD'])

export interface RetryOptions {
  /** Nombre total d'essais (3 par défaut). */
  attempts?: number
  /** Attente avant le 2e essai, doublée ensuite (300 ms par défaut). */
  baseDelayMs?: number
  /** Plafond d'une attente, y compris `Retry-After` (5 s par défaut). */
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  /** Aléa dans [0,1[ pour la gigue (injectable en test). */
  random?: () => number
}

export function isIdempotentMethod(method: string | undefined): boolean {
  return IDEMPOTENT_METHODS.has((method ?? 'GET').toUpperCase())
}

/** Attente en ms avant l'essai suivant (`attempt` = essai qui vient d'échouer, à partir de 1). */
export function retryDelayMs(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'random'> = {},
  retryAfterHeader?: string | null,
): number {
  const max = options.maxDelayMs ?? 5_000
  const seconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(max, Math.round(seconds * 1000))
  const base = (options.baseDelayMs ?? 300) * 2 ** (attempt - 1)
  const jitter = 0.5 + (options.random ?? Math.random)() * 0.5
  return Math.min(max, Math.round(base * jitter))
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Exécute `doFetch` ; rejoue les lectures sur erreur réseau ou statut transitoire.
 * Une écriture n'est jamais rejouée. La dernière réponse (ou erreur) est restituée telle quelle.
 */
export async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  method: string | undefined,
  options: RetryOptions = {},
): Promise<Response> {
  const attempts = isIdempotentMethod(method) ? Math.max(1, options.attempts ?? 3) : 1
  const sleep = options.sleep ?? defaultSleep

  for (let attempt = 1; ; attempt += 1) {
    let res: Response
    try {
      res = await doFetch()
    } catch (error) {
      if (attempt >= attempts) throw error
      await sleep(retryDelayMs(attempt, options))
      continue
    }
    if (attempt >= attempts || !RETRYABLE_STATUSES.has(res.status)) return res
    await res.body?.cancel().catch(() => undefined)
    await sleep(retryDelayMs(attempt, options, res.headers.get('retry-after')))
  }
}
