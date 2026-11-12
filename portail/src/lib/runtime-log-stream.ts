import { hasPossibleSecret, maskSecrets, parseLogs, type LogLine } from '@/lib/log-lines'
import { sleep, type SseSend } from '@/lib/sse'

export type RuntimeLogClient = {
  getLogs(lines: number, serviceName?: string): Promise<{ logs: string } | { error: string }>
}

export type RuntimeStreamInput = {
  client: RuntimeLogClient
  /** Nombre de lignes demandées à chaque sondage (fenêtre glissante côté Coolify). */
  lines?: number
  serviceName?: string
  secrets: readonly string[]
  /** Curseur de reprise (rang de la première ligne à renvoyer). */
  from?: number
  intervalMs?: number
  maxFailures?: number
  /** Nombre maximal de lignes émises par sondage (contre-pression). */
  maxLinesPerPoll?: number
  send: SseSend
  signal: AbortSignal
}

const toPayload = (lines: LogLine[], secrets: readonly string[]) =>
  lines.map((l) => ({ n: l.n, text: maskSecrets(l.text, secrets), ...(l.ts ? { ts: l.ts } : {}) }))

/**
 * Aligne un instantané (fenêtre des N dernières lignes) sur le flux déjà émis.
 * Les lignes reçues de Coolify sont renumérotées localement à partir de `0` par
 * `parseLogs` ; on les recale sur la suite globale en cherchant le plus long
 * suffixe du flux connu qui est préfixe de l'instantané courant.
 *
 * Retourne les lignes nouvelles (rangs globaux) et le rang global de la première
 * ligne de l'instantané courant.
 */
export function diffRuntimeSnapshot(
  snapshot: LogLine[],
  previous: LogLine[],
  nextGlobalBase: number,
): { fresh: LogLine[]; globalBase: number } {
  if (snapshot.length === 0) return { fresh: [], globalBase: nextGlobalBase }

  const maxOverlap = Math.min(previous.length, snapshot.length)
  let overlap = 0
  for (let k = maxOverlap; k >= 1; k--) {
    let ok = true
    // Compare le suffixe de `previous` au préfixe de `snapshot` (texte + horodatage).
    for (let i = 0; i < k; i++) {
      const a = previous[previous.length - k + i]!
      const b = snapshot[i]!
      if (a.text !== b.text || a.ts !== b.ts) {
        ok = false
        break
      }
    }
    if (ok) {
      overlap = k
      break
    }
  }

  const globalBase = nextGlobalBase - overlap
  const mapped = snapshot.map((line, i) => ({ ...line, n: globalBase + i }))
  const fresh = mapped.filter((line) => line.n >= nextGlobalBase)
  return { fresh, globalBase }
}

/**
 * Diffuse les journaux d'exécution d'un conteneur par sondage de l'API Coolify.
 * Événements : `log`, `warn`, `end`. Le flux reste ouvert tant que le client est
 * connecté ; `sseResponse` borne la durée et le navigateur se reconnecte avec
 * `Last-Event-ID` (le curseur est le rang de la dernière ligne émise).
 */
export async function streamRuntimeLogs(input: RuntimeStreamInput): Promise<void> {
  const {
    client,
    secrets,
    send,
    signal,
    lines = 200,
    serviceName,
    intervalMs = 2_000,
    maxFailures = 5,
    maxLinesPerPoll = 500,
  } = input

  let cursor = Math.max(0, input.from ?? 0)
  let nextGlobalBase = cursor
  let previous: LogLine[] = []
  let failures = 0
  let warned = false
  let truncatedWarned = false
  let secretWarned = false

  while (!signal.aborted) {
    try {
      const res = await client.getLogs(lines, serviceName)
      if ('error' in res) throw new Error(res.error)
      failures = 0
      warned = false

      const snapshot = parseLogs(res.logs)
      const { fresh, globalBase } = diffRuntimeSnapshot(snapshot, previous, nextGlobalBase)
      previous = snapshot
      const snapshotEnd = globalBase + snapshot.length

      // Si le curseur demandé est plus ancien que la fenêtre disponible, on
      // reprend au début de la fenêtre et on le signale (pas d'historique).
      let toSend = fresh.filter((line) => line.n >= cursor)
      if (cursor < globalBase && snapshot.length > 0 && !truncatedWarned) {
        truncatedWarned = true
        send('warn', {
          message:
            'Les lignes antérieures ne sont plus disponibles dans la fenêtre actuelle. Le flux reprend aux journaux récents.',
        })
        cursor = globalBase
        toSend = snapshot.map((line, i) => ({ ...line, n: globalBase + i }))
      }

      if (!secretWarned && toSend.some((line) => hasPossibleSecret(line.text))) {
        secretWarned = true
        send('warn', {
          message:
            'Certaines lignes ressemblent à des secrets (clés, jetons). Les valeurs connues sont masquées ; évitez d’écrire des secrets dans les journaux.',
        })
      }

      if (toSend.length > maxLinesPerPoll) {
        const dropped = toSend.length - maxLinesPerPoll
        toSend = toSend.slice(-maxLinesPerPoll)
        send('warn', {
          message: `Débit élevé : ${dropped} ligne(s) omise(s) pour préserver la fluidité. Utilisez le téléchargement pour l’intégralité récente.`,
        })
      }

      if (toSend.length > 0) {
        cursor = toSend[toSend.length - 1]!.n + 1
        send('log', { lines: toPayload(toSend, secrets) }, cursor - 1)
      } else if (snapshotEnd > nextGlobalBase) {
        // Rien de nouveau à envoyer (ex. reprise au-delà du snapshot) mais la base avance.
        cursor = Math.max(cursor, snapshotEnd)
      }
      nextGlobalBase = snapshotEnd
    } catch {
      failures += 1
      if (!warned) {
        warned = true
        send('warn', { message: 'Journaux momentanément indisponibles. Nouvelle tentative…' })
      }
      if (failures >= maxFailures) {
        send('warn', {
          message:
            'Impossible de lire les journaux d’exécution pour le moment. Vérifiez que l’hébergement est joignable, puis rechargez.',
        })
        send('end', { reason: 'unavailable' })
        return
      }
    }
    await sleep(intervalMs, signal)
  }
}
