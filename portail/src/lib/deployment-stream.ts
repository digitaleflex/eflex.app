import type { CoolifyClient } from '@/lib/coolify'
import { mapDeploymentStatus, tailLogs } from '@/lib/coolify'
import { maskSecrets, parseLogs, type LogLine } from '@/lib/log-lines'
import { sleep, type SseSend } from '@/lib/sse'

const TERMINAL = new Set(['live', 'failed', 'rollbacked'])

export type StreamInput = {
  client: Pick<CoolifyClient, 'getDeployment'>
  deployment: { status: string; coolifyBuildId: string | null; logsSummary: string | null }
  /** Valeurs à ne jamais montrer (variables d'environnement du projet). */
  secrets: readonly string[]
  /** Rang de la première ligne à envoyer (reprise après coupure). */
  from?: number
  intervalMs?: number
  /** Nombre d'échecs Coolify consécutifs tolérés avant d'abandonner. */
  maxFailures?: number
  send: SseSend
  signal: AbortSignal
  /** Appelé une fois quand le déploiement atteint un état final côté Coolify. */
  onFinished?: (result: { status: string; commitSha?: string; logsSummary?: string }) => Promise<void> | void
}

const COMMIT_RE = /^[0-9a-f]{7,40}$/

const toPayload = (lines: LogLine[], secrets: readonly string[]) =>
  lines.map((l) => ({ n: l.n, text: maskSecrets(l.text, secrets), ...(l.ts ? { ts: l.ts } : {}) }))

/**
 * Diffuse les journaux d'un déploiement : uniquement les lignes nouvelles, secrets masqués,
 * jusqu'à l'état final. Les événements : `log` (lignes), `status`, `warn`, `end`.
 */
export async function streamDeploymentLogs(input: StreamInput): Promise<void> {
  const { client, deployment, secrets, send, signal, intervalMs = 2_000, maxFailures = 5, onFinished } = input
  let cursor = Math.max(0, input.from ?? 0)
  let lastStatus = ''
  let failures = 0
  let warned = false

  const emitLines = (lines: LogLine[]) => {
    const fresh = lines.filter((l) => l.n >= cursor)
    if (fresh.length === 0) return
    cursor = fresh[fresh.length - 1]!.n + 1
    send('log', { lines: toPayload(fresh, secrets) }, cursor - 1)
  }
  const emitStatus = (status: string) => {
    if (status === lastStatus) return
    lastStatus = status
    send('status', { status })
  }

  // Pas de déploiement côté Coolify (échec avant provisionnement) : on rejoue le résumé enregistré.
  if (!deployment.coolifyBuildId) {
    emitLines(parseLogs(deployment.logsSummary ?? undefined))
    emitStatus(deployment.status)
    send('end', { reason: 'complete' })
    return
  }

  while (!signal.aborted) {
    try {
      const remote = await client.getDeployment(deployment.coolifyBuildId)
      failures = 0
      warned = false
      emitLines(parseLogs(remote.logs))
      const status = mapDeploymentStatus(remote.status)
      emitStatus(status)
      if (TERMINAL.has(status)) {
        await onFinished?.({
          status,
          ...(remote.commit && COMMIT_RE.test(remote.commit) ? { commitSha: remote.commit } : {}),
          ...(status === 'failed' ? { logsSummary: tailLogs(remote.logs) || 'Le déploiement a échoué (journaux indisponibles).' } : {}),
        })
        send('end', { reason: 'complete' })
        return
      }
    } catch {
      failures += 1
      if (!warned) {
        warned = true
        send('warn', { message: 'Journaux momentanément indisponibles. Nouvelle tentative…' })
      }
      if (failures >= maxFailures) {
        // Dernier recours : le résumé enregistré, puis fin du flux.
        emitLines(parseLogs(deployment.logsSummary ?? undefined))
        emitStatus(deployment.status)
        send('end', { reason: 'unavailable' })
        return
      }
    }
    await sleep(intervalMs, signal)
  }
}
