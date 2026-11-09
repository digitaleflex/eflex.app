import { mapCoolifyStatus } from '@/lib/coolify-status'
import { maskSecrets, parseLogs, type LogLine } from '@/lib/log-lines'
import { sleep, type SseSend } from '@/lib/sse'

const TERMINAL = new Set(['live', 'failed'])
const DB_TERMINAL = new Set(['live', 'failed', 'cancelled'])

type DeploymentRow = { status: string; coolifyBuildId: string | null; logsSummary: string | null }

export type StreamInput = {
  /** Source des journaux : un appel renvoie le statut Coolify brut et le journal complet. */
  client: { getDeployment(deploymentId: string): Promise<{ status: string; logs?: string }> }
  deployment: DeploymentRow
  /**
   * Relit le déploiement en base. Tant qu'il n'est pas parti chez Coolify (file d'attente, analyse,
   * préparation), le flux attend son identifiant de build ; sans cette fonction il rejoue le résumé et s'arrête.
   */
  reload?: () => Promise<DeploymentRow | null>
  /** Valeurs à ne jamais montrer (variables d'environnement du projet). */
  secrets: readonly string[]
  /** Rang de la première ligne à envoyer (reprise après coupure). */
  from?: number
  intervalMs?: number
  /** Nombre d'échecs Coolify consécutifs tolérés avant d'abandonner. */
  maxFailures?: number
  send: SseSend
  signal: AbortSignal
  /**
   * Appelé une fois quand Coolify annonce un état final. Lecture seule : l'état en base reste
   * la propriété du worker de déploiement (machine à états), ce flux ne l'écrit jamais.
   */
  onFinished?: (result: { status: string }) => Promise<void> | void
}

const toPayload = (lines: LogLine[], secrets: readonly string[]) =>
  lines.map((l) => ({ n: l.n, text: maskSecrets(l.text, secrets), ...(l.ts ? { ts: l.ts } : {}) }))

/**
 * Diffuse les journaux d'un déploiement : uniquement les lignes nouvelles, secrets masqués,
 * jusqu'à l'état final. Les événements : `log` (lignes), `status`, `warn`, `end`.
 */
export async function streamDeploymentLogs(input: StreamInput): Promise<void> {
  const { client, secrets, send, signal, intervalMs = 2_000, maxFailures = 5, onFinished, reload } = input
  let deployment = input.deployment
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

  // Pas (encore) de déploiement côté Coolify : file d'attente, analyse, préparation, ou échec avant l'envoi.
  // Avec `reload`, on attend que le worker démarre le build ; sinon on rejoue le résumé enregistré.
  while (!deployment.coolifyBuildId) {
    emitStatus(deployment.status)
    if (!reload || DB_TERMINAL.has(deployment.status) || signal.aborted) {
      emitLines(parseLogs(deployment.logsSummary ?? undefined))
      send('end', { reason: 'complete' })
      return
    }
    await sleep(intervalMs, signal)
    if (signal.aborted) return
    const next = await reload().catch(() => null)
    if (!next) {
      send('end', { reason: 'unavailable' })
      return
    }
    deployment = next
  }
  const buildId = deployment.coolifyBuildId

  while (!signal.aborted) {
    try {
      const remote = await client.getDeployment(buildId)
      failures = 0
      warned = false
      emitLines(parseLogs(remote.logs))
      const status = mapCoolifyStatus(remote.status)
      emitStatus(status)
      if (TERMINAL.has(status)) {
        await onFinished?.({ status })
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
