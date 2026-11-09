'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type LiveEvent = { id?: string; type: string; organizationId?: string | null; at?: string; [key: string]: unknown }
export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'ended'

type Handler = (event: LiveEvent) => void
type Ctx = {
  state: ConnectionState
  /** S'abonne à des types d'événements ; renvoie la fonction de désabonnement. */
  subscribe: (types: readonly string[], handler: Handler) => () => void
}

const EventsContext = createContext<Ctx | null>(null)

/**
 * `scope` identifie ce à quoi le flux est lié côté serveur (l'organisation active) : quand il change,
 * la connexion est rouverte, sinon l'onglet continuerait de recevoir les événements de l'ancienne
 * organisation et jamais ceux de la nouvelle.
 *
 * Une seule connexion SSE par onglet (`/api/events`), partagée par tous les composants.
 * EventSource se reconnecte seul avec `Last-Event-ID` : aucun événement n'est perdu ni rejoué deux fois.
 */
export function EventsProvider({ children, scope }: { children: React.ReactNode; scope?: string | null }) {
  const [state, setState] = useState<ConnectionState>('connecting')
  const handlers = useRef(new Set<{ types: readonly string[]; handler: Handler }>())

  useEffect(() => {
    setState('connecting')
    const source = new EventSource('/api/events')
    source.addEventListener('open', () => setState('live'))
    source.addEventListener('event', (e) => {
      const message = e as MessageEvent<string>
      let data: LiveEvent
      try {
        data = { ...(JSON.parse(message.data) as LiveEvent), id: message.lastEventId }
      } catch {
        return
      }
      for (const entry of handlers.current) {
        if (entry.types.includes(data.type) || entry.types.includes('*')) entry.handler(data)
      }
    })
    source.addEventListener('end', () => {
      source.close()
      setState('ended')
    })
    source.onerror = () => setState(source.readyState === EventSource.CLOSED ? 'ended' : 'reconnecting')
    return () => source.close()
  }, [scope])

  const subscribe = useCallback((types: readonly string[], handler: Handler) => {
    const entry = { types, handler }
    handlers.current.add(entry)
    return () => void handlers.current.delete(entry)
  }, [])

  const value = useMemo(() => ({ state, subscribe }), [state, subscribe])
  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
}

/** Appelle `handler` à chaque événement des types demandés (`'*'` : tous). Sans effet hors fournisseur. */
export function useEvents(types: readonly string[], handler: Handler) {
  const ctx = useContext(EventsContext)
  const latest = useRef(handler)
  latest.current = handler
  const key = types.join('|')
  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe(types, (event) => latest.current(event))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key])
}

export function useConnectionState(): ConnectionState | null {
  return useContext(EventsContext)?.state ?? null
}
