/**
 * Enregistrement fiable de l'identifiant d'application Coolify.
 *
 * Une fois l'application créée chez Coolify, son identifiant doit être écrit en
 * base : sans lui, le retry du job en créerait une seconde (doublon) et la
 * première resterait orpheline. On réessaie donc l'écriture, et si elle
 * échoue pour de bon, on supprime l'application qu'on vient de créer plutôt
 * que de la laisser sans propriétaire.
 */

export type PersistResult =
  | { ok: true }
  | { ok: false; error: string; rolledBack: boolean }

export interface PersistOptions {
  appId: string
  /** Écriture en base de l'identifiant (peut lever). */
  write: (appId: string) => Promise<void>
  /** Suppression de l'application Coolify créée (compensation). */
  rollback: (appId: string) => Promise<{ ok: true } | { error: string }>
  /** Nombre total d'essais d'écriture (3 par défaut). */
  attempts?: number
  /** Attente entre deux essais, multipliée à chaque fois (200 ms par défaut). */
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function persistCreatedAppId(options: PersistOptions): Promise<PersistResult> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const sleep = options.sleep ?? defaultSleep
  let delay = options.delayMs ?? 200
  let lastError = ''

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await options.write(options.appId)
      return { ok: true }
    } catch (error) {
      lastError = describe(error)
      if (attempt < attempts) {
        await sleep(delay)
        delay *= 2
      }
    }
  }

  const removed = await options.rollback(options.appId)
  return { ok: false, error: lastError, rolledBack: 'ok' in removed }
}
