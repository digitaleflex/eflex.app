import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/admin'
import { eventsSince, latestEventId, subscribe } from '@/lib/event-bus'
import type { PlatformEvent } from '@/lib/event-bus'
import { organizationNames, wireFromEvent } from '@/lib/live-events-server'
import { sleep, sseResponse } from '@/lib/sse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Revérification des droits : un compte suspendu ou rétrogradé perd le flux. */
const RECHECK_MS = 30_000

/**
 * Flux temps réel du terminal d'exploitation (Server-Sent Events).
 *
 * Séparé de `/api/events` (filtré par organisation, un flux par onglet) : celui-ci est
 * global et réservé aux administrateurs, qui doivent voir tous les événements de la
 * plateforme. Reprise via `Last-Event-ID` (envoyé par le navigateur à la reconnexion) ou `?after=`.
 * Les charges utiles passent par `redact` : jamais de secret dans le flux.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const userId = guard.session.user.id

  const url = new URL(request.url)
  const header = request.headers.get('last-event-id')
  const requested = Number.parseInt(header ?? url.searchParams.get('after') ?? '', 10)
  // Premier branchement : on part du dernier événement connu (le client a déjà l'historique).
  const startAfter = Number.isFinite(requested) && requested >= 0 ? requested : await latestEventId()

  return sseResponse(
    async (send, signal) => {
      let lastSent = startAfter
      let replaying = true
      const pending: PlatformEvent[] = []
      const names = new Map<string, string | null>()

      const nameOf = async (organizationId: string | null): Promise<string | null> => {
        if (!organizationId) return null
        if (names.has(organizationId)) return names.get(organizationId) ?? null
        const found = await organizationNames([organizationId])
        const name = found[organizationId] ?? null
        names.set(organizationId, name)
        return name
      }

      // Envois sérialisés : les noms d'organisation sont résolus sans réordonner le flux.
      let chain: Promise<void> = Promise.resolve()
      const deliver = (event: PlatformEvent) => {
        if (event.id <= lastSent) return
        lastSent = event.id
        chain = chain
          .then(async () => send('event', wireFromEvent(event, await nameOf(event.organizationId)), event.id))
          .catch(() => {})
      }

      const unsubscribe = subscribe((event) => (replaying ? pending.push(event) : deliver(event)))
      try {
        send('ready', { lastEventId: startAfter, serverTime: new Date().toISOString() })
        for (const event of await eventsSince(startAfter)) deliver(event)
        replaying = false
        for (const event of pending.splice(0)) deliver(event)

        while (!signal.aborted) {
          await sleep(RECHECK_MS, signal)
          if (signal.aborted) break
          const account = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, banned: true } })
          if (!account || account.role !== 'admin' || account.banned) {
            send('end', { reason: 'forbidden' })
            return
          }
        }
      } finally {
        unsubscribe()
      }
    },
    { signal: request.signal, maxMs: 10 * 60_000 },
  )
}
