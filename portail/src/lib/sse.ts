/** Utilitaires pour les flux Server-Sent Events (journaux et activité en direct). */

const encoder = new TextEncoder()

export type SseSend = (event: string, data: unknown, id?: string | number) => void

/** Formate un événement SSE. Les sauts de ligne de `data` sont répartis sur plusieurs `data:`. */
export function formatEvent(event: string, data: unknown, id?: string | number): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return (
    (id !== undefined ? `id: ${id}\n` : '') +
    `event: ${event}\n` +
    payload
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n') +
    '\n\n'
  )
}

type Options = {
  /** Signal d'annulation de la requête : le flux s'arrête quand le navigateur se déconnecte. */
  signal: AbortSignal
  /** Intervalle des commentaires de maintien de connexion (proxys, équilibreurs). */
  heartbeatMs?: number
  /** Durée maximale d'un flux ; le client se reconnecte ensuite avec Last-Event-ID. */
  maxMs?: number
}

/**
 * Réponse SSE : `run` reçoit `send` et rend la main quand le flux est terminé.
 * Le flux est fermé proprement à la fin de `run`, à la déconnexion du client ou après `maxMs`.
 */
export function sseResponse(run: (send: SseSend, signal: AbortSignal) => Promise<void>, { signal, heartbeatMs = 15_000, maxMs = 10 * 60_000 }: Options): Response {
  const controller = new AbortController()
  const stop = () => controller.abort()
  signal.addEventListener('abort', stop, { once: true })

  const stream = new ReadableStream<Uint8Array>({
    async start(stream) {
      let closed = false
      const write = (chunk: string) => {
        if (!closed) stream.enqueue(encoder.encode(chunk))
      }
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(beat)
        clearTimeout(limit)
        signal.removeEventListener('abort', stop)
        try {
          stream.close()
        } catch {
          /* déjà fermé */
        }
      }
      const beat = setInterval(() => write(': ping\n\n'), heartbeatMs)
      const limit = setTimeout(stop, maxMs)
      controller.signal.addEventListener('abort', close, { once: true })
      write('retry: 3000\n\n')
      try {
        await run((event, data, id) => write(formatEvent(event, data, id)), controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) write(formatEvent('error', { message: error instanceof Error ? error.message : 'Erreur inconnue' }))
      } finally {
        close()
      }
    },
    cancel() {
      stop()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // Empêche nginx/Traefik de mettre le flux en tampon.
      'x-accel-buffering': 'no',
    },
  })
}

/** Attente interrompue par le signal (pas de minuterie qui survit à la déconnexion). */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(done, ms)
    function done() {
      clearTimeout(t)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
