import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type Audience = 'org' | 'admin' | 'user'

export type PlatformEvent = {
  id: number
  type: string
  audience: Audience
  organizationId: string | null
  userId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export type PublishInput = {
  type: string
  audience?: Audience
  organizationId?: string | null
  userId?: string | null
  /** Identifiants et statuts uniquement : jamais de secret ni de valeur de variable. */
  payload?: Record<string, unknown>
}

type Listener = (event: PlatformEvent) => void

type BusState = {
  listeners: Set<Listener>
  cursor: number | null
  /** Identifiants déjà distribués dans la fenêtre de relecture (voir LOOKBACK). */
  seen: Set<number>
  timer: ReturnType<typeof setInterval> | null
  polling: boolean
  again: boolean
  lastPurge: number
}

// État partagé par processus (survit au rechargement à chaud en développement).
const g = globalThis as unknown as { __eflexBus?: BusState }
const state: BusState = (g.__eflexBus ??= { listeners: new Set(), cursor: null, seen: new Set(), timer: null, polling: false, again: false, lastPurge: 0 })

const POLL_MS = 1_000
const BATCH = 500
/**
 * Les identifiants sont attribués à l'insertion, pas à la validation : deux publications concurrentes
 * peuvent être validées dans l'ordre inverse (42 visible avant 41). Un curseur « id > dernier vu » sauterait
 * alors 41 pour toujours. On relit donc les LOOKBACK derniers identifiants à chaque passage et on
 * déduplique.
 */
const LOOKBACK = 100
const RETENTION_MS = 24 * 3600 * 1000

type Row = { id: bigint; type: string; audience: string; organizationId: string | null; userId: string | null; payload: Prisma.JsonValue; createdAt: Date }
const toEvent = (r: Row): PlatformEvent => ({
  id: Number(r.id),
  type: r.type,
  audience: r.audience as Audience,
  organizationId: r.organizationId,
  userId: r.userId,
  payload: (r.payload ?? {}) as Record<string, unknown>,
  createdAt: r.createdAt.toISOString(),
})

/**
 * Publie un événement : écriture en base (durable, reprise possible), puis réveil immédiat de
 * l'interrogateur local. Un échec de publication ne doit jamais faire échouer l'action métier.
 */
export async function publish(input: PublishInput): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        type: input.type,
        audience: input.audience ?? 'org',
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    })
    void poll()
  } catch (error) {
    console.error('[événements] publication impossible', input.type, error)
  }
}

/** Événements strictement postérieurs à `afterId`, pour la reprise d'un flux. */
export async function eventsSince(afterId: number, limit = 1_000): Promise<PlatformEvent[]> {
  const rows = await prisma.event.findMany({ where: { id: { gt: BigInt(afterId) } }, orderBy: { id: 'asc' }, take: limit })
  return rows.map(toEvent)
}

/** Identifiant du dernier événement (point de départ d'un nouveau flux). */
export async function latestEventId(): Promise<number> {
  const last = await prisma.event.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  return last ? Number(last.id) : 0
}

async function poll(): Promise<void> {
  if (state.polling) {
    state.again = true
    return
  }
  state.polling = true
  try {
    do {
      state.again = false
      if (state.cursor === null) state.cursor = await latestEventId()
      const from = Math.max(0, state.cursor - LOOKBACK)
      const rows = await prisma.event.findMany({ where: { id: { gt: BigInt(from) } }, orderBy: { id: 'asc' }, take: BATCH })
      for (const row of rows) {
        const event = toEvent(row)
        if (state.seen.has(event.id)) continue
        state.seen.add(event.id)
        state.cursor = Math.max(state.cursor, event.id)
        for (const listener of state.listeners) {
          try {
            listener(event)
          } catch {
            /* un abonné défaillant ne bloque pas les autres */
          }
        }
      }
      // Mémoire bornée : on n'oublie que ce qui est sorti de la fenêtre de relecture.
      for (const id of state.seen) if (id < state.cursor - LOOKBACK) state.seen.delete(id)
      if (rows.length === BATCH) state.again = true
    } while (state.again)
    await purgeOccasionally()
  } catch (error) {
    console.error('[événements] interrogation impossible', error)
  } finally {
    state.polling = false
  }
}

async function purgeOccasionally() {
  if (Date.now() - state.lastPurge < 10 * 60_000) return
  state.lastPurge = Date.now()
  await prisma.event.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
}

/** S'abonne aux nouveaux événements. Un seul interrogateur par processus, quel que soit le nombre d'abonnés. */
export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener)
  if (!state.timer) {
    state.timer = setInterval(() => void poll(), POLL_MS)
    state.timer.unref?.()
  }
  void poll()
  return () => {
    state.listeners.delete(listener)
    if (state.listeners.size === 0 && state.timer) {
      clearInterval(state.timer)
      state.timer = null
      state.cursor = null // le prochain abonné repartira du dernier événement connu
      state.seen.clear()
    }
  }
}

/** Qui a le droit de recevoir cet événement. */
export type Viewer = { userId: string; organizationId: string | null; isAdmin: boolean }
export function isVisibleTo(event: PlatformEvent, viewer: Viewer): boolean {
  switch (event.audience) {
    case 'org':
      return event.organizationId !== null && event.organizationId === viewer.organizationId
    case 'admin':
      return viewer.isAdmin
    case 'user':
      return event.userId === viewer.userId
    default:
      return false
  }
}
