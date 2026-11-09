import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'
import { resolveOrganization } from '@/lib/organizations'
import { eventsSince, isVisibleTo, latestEventId, subscribe, type PlatformEvent } from '@/lib/event-bus'
import { sleep, sseResponse } from '@/lib/sse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_STREAMS_PER_USER = 5
const REPLAY_BATCH = Number(process.env.EVENTS_REPLAY_BATCH) || 1_000
const RECHECK_MS = Number(process.env.EVENTS_RECHECK_MS) || 30_000
const open = new Map<string, number>()

/**
 * Flux d'événements de la plateforme : un seul par onglet, filtré par organisation active.
 * Reprise automatique via `Last-Event-ID` (le navigateur le renvoie à chaque reconnexion).
 * Les droits sont revérifiés régulièrement : membre retiré ou session fermée ⇒ fin du flux.
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const userId = session.user.id
  const sessionId = session.session.id

  if ((open.get(userId) ?? 0) >= MAX_STREAMS_PER_USER) {
    return NextResponse.json({ error: 'Trop de flux ouverts. Fermez un onglet puis réessayez.' }, { status: 429 })
  }

  const org = await resolveOrganization(session)
  const viewer = { userId, organizationId: org?.organizationId ?? null, isAdmin: isAdmin(session) }

  const header = request.headers.get('last-event-id')
  const requested = Number.parseInt(header ?? '', 10)
  // Premier branchement : on part du dernier événement connu (pas de rejeu de l'historique).
  const startAfter = Number.isFinite(requested) ? requested : await latestEventId()

  open.set(userId, (open.get(userId) ?? 0) + 1)
  const release = () => open.set(userId, Math.max(0, (open.get(userId) ?? 1) - 1))

  return sseResponse(
    async (send, signal) => {
      let lastSent = startAfter
      let replaying = true
      const pending: PlatformEvent[] = []
      // Rejeu et temps réel se chevauchent : on déduplique par identifiant (et non par « plus grand vu »,
      // qui jetterait un événement validé en retard avec un identifiant plus petit).
      const sent = new Set<number>()

      const deliver = (event: PlatformEvent) => {
        if (event.id <= startAfter || sent.has(event.id)) return
        sent.add(event.id)
        lastSent = Math.max(lastSent, event.id)
        if (!isVisibleTo(event, viewer)) return
        send('event', { type: event.type, organizationId: event.organizationId, ...event.payload, at: event.createdAt }, event.id)
      }

      // On s'abonne d'abord (les événements arrivés pendant le rejeu sont mis de côté), puis on rejoue.
      const unsubscribe = subscribe((event) => (replaying ? pending.push(event) : deliver(event)))
      try {
        send('ready', { organizationId: viewer.organizationId, lastEventId: startAfter })
        // Rejeu par lots jusqu'à épuisement : s'arrêter au premier lot perdrait en silence ce qui suit.
        let cursor = startAfter
        for (;;) {
          const batch = await eventsSince(cursor, REPLAY_BATCH)
          for (const event of batch) deliver(event)
          if (batch.length < REPLAY_BATCH) break
          cursor = batch[batch.length - 1]!.id
        }
        replaying = false
        for (const event of pending.splice(0)) deliver(event)

        // Tant que le client est là : revérification périodique des droits.
        while (!signal.aborted) {
          await sleep(RECHECK_MS, signal)
          if (signal.aborted) break
          const [stillThere, stillMember] = await Promise.all([
            prisma.session.count({ where: { id: sessionId, expiresAt: { gt: new Date() } } }),
            viewer.organizationId
              ? prisma.member.count({ where: { userId, organizationId: viewer.organizationId } })
              : Promise.resolve(1),
          ])
          if (!stillThere || !stillMember) {
            send('end', { reason: 'forbidden' })
            return
          }
        }
      } finally {
        unsubscribe()
        release()
      }
    },
    { signal: request.signal, maxMs: 10 * 60_000 },
  )
}
