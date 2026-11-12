import { DEFAULT_MAX_LINE_LENGTH, parseLogs, sanitizeLogText, type LogLine } from '@/lib/log-lines'
import { sleep, type SseSend } from '@/lib/sse'

export type RuntimeLogClient = {
  getLogs(lines: number, serviceName?: string): Promise<{ logs: string } | { error: string }>
}

export type RuntimeStreamStats = {
  emitted: number
  dropped: number
  truncatedLines: number
  suspiciousLines: number
  windowStart: number | null
  windowEnd: number | null
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
  /** Longueur maximale d'une ligne diffusée (les lignes plus longues sont tronquées). */
  maxLineLength?: number
  send: SseSend
  signal: AbortSignal
}

type Prepared = { n: number; text: string; ts?: string; suspicious: boolean; truncated: boolean }

const prepare = (lines: LogLine[], secrets: readonly string[], maxLineLength: number): Prepared[] =>
  lines.map((line) => {
    const sanitized = sanitizeLogText(line.text, secrets, maxLineLength)
    return {
      n: line.n,
      text: sanitized.text,
      suspicious: sanitized.suspicious,
      truncated: sanitized.truncated,
      ...(line.ts ? { ts: line.ts } : {}),
    }
  })

const toPayload = (lines: Prepared[]) =>
  lines.map((l) => ({ n: l.n, text: l.text, ...(l.ts ? { ts: l.ts } : {}) }))

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
 * Événements : `log`, `warn`, `stats`, `end`. Le flux reste ouvert tant que le
 * client est connecté ; `sseResponse` borne la durée et le navigateur se
 * reconnecte avec `Last-Event-ID` (curseur = rang de la dernière ligne émise).
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
    maxLineLength = DEFAULT_MAX_LINE_LENGTH,
  } = input

  let cursor = Math.max(0, input.from ?? 0)
  let nextGlobalBase = cursor
  let previous: LogLine[] = []
  let failures = 0
  let warned = false
  let truncatedWindowWarned = false
  let secretWarned = false
  let droppedTotal = 0
  let truncatedLinesTotal = 0
  let suspiciousTotal = 0

  const emitStats = (globalBase: number, snapshotEnd: number) => {
    const stats: RuntimeStreamStats = {
      emitted: Math.max(0, cursor),
      dropped: droppedTotal,
      truncatedLines: truncatedLinesTotal,
      suspiciousLines: suspiciousTotal,
      windowStart: snapshotEnd > globalBase ? globalBase : null,
      windowEnd: snapshotEnd > globalBase ? snapshotEnd - 1 : null,
    }
    send('stats', stats)
  }

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

      // Curseur plus ancien que la fenêtre disponible : reprise au début de la
      // fenêtre (pas d'historique complet côté Coolify) avec avertissement explicite.
      let toSend = fresh.filter((line) => line.n >= cursor)
      if (snapshot.length > 0 && cursor < globalBase) {
        if (!truncatedWindowWarned) {
          truncatedWindowWarned = true
          send('warn', {
            message:
              'Les lignes antérieures ne sont plus disponibles dans la fenêtre actuelle. Le flux reprend aux journaux récents.',
          })
        }
        cursor = globalBase
        toSend = snapshot.map((line, i) => ({ ...line, n: globalBase + i }))
      }

      let droppedThisPoll = 0
      if (toSend.length > maxLinesPerPoll) {
        droppedThisPoll = toSend.length - maxLinesPerPoll
        droppedTotal += droppedThisPoll
        // On garde la fin (les lignes les plus récentes) et on avance le curseur
        // pour éviter de retraiter indéfiniment les mêmes lignes omises.
        toSend = toSend.slice(-maxLinesPerPoll)
        send('warn', {
          message: `Débit élevé : ${droppedThisPoll} ligne(s) omise(s) ce cycle (${droppedTotal} au total) pour préserver la fluidité. Téléchargez la fenêtre récente pour l’intégralité disponible.`,
        })
      }

      const prepared = prepare(toSend, secrets, maxLineLength)
      const suspiciousNow = prepared.filter((line) => line.suspicious).length
      const truncatedNow = prepared.filter((line) => line.truncated).length
      suspiciousTotal += suspiciousNow
      truncatedLinesTotal += truncatedNow

      if (!secretWarned && suspiciousNow > 0) {
        secretWarned = true
        send('warn', {
          message:
            'Certaines lignes ressemblent à des secrets (clés, jetons). Les valeurs connues sont masquées ; évitez d’écrire des secrets dans les journaux.',
        })
      }
      if (truncatedNow > 0) {
        send('warn', {
          message: `${truncatedNow} ligne(s) très longue(s) ont été tronquées pour l’affichage. Le téléchargement fournit la fenêtre récente masquée.`,
        })
      }

      if (prepared.length > 0) {
        cursor = prepared[prepared.length - 1]!.n + 1
        send('log', { lines: toPayload(prepared) }, cursor - 1)
      } else if (snapshotEnd > cursor) {
        // Fenêtre avancée sans émission (ex. reprise au-delà) : on rattrape le curseur.
        cursor = snapshotEnd
      }

      nextGlobalBase = snapshotEnd
      emitStats(globalBase, snapshotEnd)
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
