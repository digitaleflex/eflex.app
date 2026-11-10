'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Pause, Play, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  CATEGORY_LABEL,
  SEVERITIES,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  categoryOf,
  describeEvent,
  formatLiveClock,
  matchesLiveFilters,
  mergeLiveEvents,
  severityOf,
  toLiveCsv,
  toLiveText,
  type LiveCategory,
  type LiveEvent,
  type LiveSeverity,
} from '@/lib/live-events'

const MAX_EVENTS = 500
const POLL_MS = 2_000

type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'polling' | 'error'

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: 'Connexion…',
  live: 'En direct',
  reconnecting: 'Reconnexion…',
  polling: 'Rattrapage toutes les 2 s',
  error: 'Flux interrompu',
}

type Props = {
  initialEvents: LiveEvent[]
  initialOrganizations: Record<string, string>
}

/**
 * Terminal d'exploitation : flux global, filtrable et exportable.
 *
 * Transport : SSE dédié (`/api/admin/live/stream`), avec repli automatique sur une
 * interrogation (`/api/admin/live?after=`) si le flux est bloqué. La pause conserve les
 * événements reçus et ne les affiche qu'à la reprise. Aucune annonce par ligne aux
 * lecteurs d'écran : seul l'état du flux et la reprise sont annoncés.
 */
export function LiveFeed({ initialEvents, initialOrganizations }: Props) {
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents)
  const [dropped, setDropped] = useState(0)
  const [paused, setPaused] = useState(false)
  const [bufferedCount, setBufferedCount] = useState(0)
  const [state, setState] = useState<ConnectionState>('connecting')
  const [notice, setNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('Connexion au flux de la plateforme.')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<LiveCategory | 'all'>('all')
  const [severity, setSeverity] = useState<LiveSeverity | 'all'>('all')

  const eventsRef = useRef<LiveEvent[]>(initialEvents)
  const bufferedRef = useRef<LiveEvent[]>([])
  const newestRef = useRef(initialEvents[initialEvents.length - 1]?.id ?? 0)
  const pausedRef = useRef(false)
  const organizations = useRef<Record<string, string>>(initialOrganizations)
  const listRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  const commit = useCallback((incoming: LiveEvent[]) => {
    const merged = mergeLiveEvents(eventsRef.current, incoming, MAX_EVENTS)
    if (merged.added === 0 && merged.dropped === 0) return
    eventsRef.current = merged.events
    setEvents(merged.events)
    if (merged.dropped > 0) setDropped((value) => value + merged.dropped)
  }, [])

  const receive = useCallback(
    (incoming: LiveEvent[]) => {
      if (incoming.length === 0) return
      newestRef.current = incoming.reduce((max, event) => (event.id > max ? event.id : max), newestRef.current)
      if (pausedRef.current) {
        const merged = mergeLiveEvents(bufferedRef.current, incoming, MAX_EVENTS)
        bufferedRef.current = merged.events
        setBufferedCount(merged.events.length)
        return
      }
      commit(incoming)
    },
    [commit],
  )

  const resume = useCallback(() => {
    const pending = bufferedRef.current
    pausedRef.current = false
    bufferedRef.current = []
    setPaused(false)
    setBufferedCount(0)
    if (pending.length > 0) commit(pending)
    setAnnouncement(
      pending.length > 0
        ? `Flux repris. ${pending.length} événement${pending.length > 1 ? 's' : ''} ajouté${pending.length > 1 ? 's' : ''}.`
        : 'Flux repris.',
    )
  }, [commit])

  const togglePause = useCallback(() => {
    if (pausedRef.current) {
      resume()
      return
    }
    pausedRef.current = true
    setPaused(true)
    setAnnouncement('Flux en pause. Les événements continuent d’être reçus sans être affichés.')
  }, [resume])

  // Transport temps réel, avec repli en interrogation si le flux SSE ne tient pas.
  useEffect(() => {
    let source: EventSource | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let failures = 0
    let disposed = false

    const pull = async () => {
      try {
        const response = await fetch(`/api/admin/live?after=${newestRef.current}&limit=200`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as { events?: LiveEvent[]; organizations?: Record<string, string> }
        if (disposed) return
        if (body.organizations) Object.assign(organizations.current, body.organizations)
        receive(body.events ?? [])
        setState('polling')
        setNotice(null)
        setAnnouncement('Flux rétabli : rattrapage automatique toutes les deux secondes.')
      } catch {
        if (disposed) return
        setState('error')
        setNotice('Le rattrapage automatique a échoué. Vérifiez votre connexion puis rechargez la page.')
      }
    }

    const startPolling = () => {
      if (poll || disposed) return
      setState('polling')
      poll = setInterval(() => void pull(), POLL_MS)
      void pull()
    }

    setState('connecting')
    source = new EventSource(`/api/admin/live/stream?after=${newestRef.current}`)
    source.addEventListener('open', () => {
      failures = 0
      setState('live')
      setNotice(null)
      setAnnouncement('Flux en direct.')
    })
    source.addEventListener('event', (raw) => {
      const message = raw as MessageEvent<string>
      try {
        const event = JSON.parse(message.data) as LiveEvent
        if (typeof event.id !== 'number' && message.lastEventId) event.id = Number(message.lastEventId)
        if (typeof event.id !== 'number' || Number.isNaN(event.id)) return
        receive([event])
      } catch {
        /* message illisible : ignoré sans casser le flux */
      }
    })
    source.addEventListener('end', () => {
      source?.close()
      source = null
      setState('error')
      setNotice('Votre accès administrateur a été retiré ou la session a expiré. Rechargez la page après reconnexion.')
      setAnnouncement('Flux arrêté : accès administrateur perdu ou session expirée.')
    })
    source.onerror = () => {
      if (disposed) return
      failures += 1
      setState('reconnecting')
      setAnnouncement('Connexion au flux interrompue, reconnexion en cours.')
      // Deux échecs consécutifs : le flux est probablement bloqué par un intermédiaire.
      if (failures >= 2 && source) {
        source.close()
        source = null
        setAnnouncement('Flux indisponible : passage au rattrapage automatique toutes les deux secondes.')
        startPolling()
      }
    }

    return () => {
      disposed = true
      source?.close()
      if (poll) clearInterval(poll)
    }
  }, [receive])

  // Suivi du bas de liste, sauf quand l'opérateur remonte ou met en pause.
  useEffect(() => {
    const element = listRef.current
    if (element && followRef.current && !paused) element.scrollTop = element.scrollHeight
  }, [events, paused])

  const onScroll = () => {
    const element = listRef.current
    if (!element) return
    followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  }

  const visible = useMemo(
    () => events.filter((event) => matchesLiveFilters(event, { category, severity, query })),
    [events, category, severity, query],
  )

  const download = (format: 'csv' | 'text') => {
    const content = format === 'csv' ? toLiveCsv(visible) : toLiveText(visible)
    const blob = new Blob([format === 'csv' ? `\uFEFF${content}` : content], {
      type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `activite-plateforme-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${format === 'csv' ? 'csv' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
  }

  const dot =
    state === 'live'
      ? 'bg-success'
      : state === 'connecting' || state === 'reconnecting' || state === 'polling'
        ? 'bg-warning'
        : 'bg-destructive'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', dot, state === 'live' && 'animate-pulse motion-reduce:animate-none')} />
          {paused ? 'En pause' : STATE_LABEL[state]}
        </span>
        <span className="text-xs text-muted-foreground">
          {visible.length === events.length
            ? `${events.length} événement${events.length > 1 ? 's' : ''}`
            : `${visible.length} sur ${events.length} événements`}
          {dropped > 0 && ` · ${dropped} ancien${dropped > 1 ? 's' : ''} retiré${dropped > 1 ? 's' : ''}`}
        </span>
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher dans les événements"
              className="h-11 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-48"
            />
          </div>
          <label className="sr-only" htmlFor="live-category">
            Filtrer par type d’événement
          </label>
          <select
            id="live-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as LiveCategory | 'all')}
            className="h-11 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tous les types</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABEL[value]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="live-severity">
            Filtrer par gravité
          </label>
          <select
            id="live-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as LiveSeverity | 'all')}
            className="h-11 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Toutes les gravités</option>
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {SEVERITY_LABEL[value]}
              </option>
            ))}
          </select>
          <Button variant={paused ? 'primary' : 'outline'} size="sm" onClick={togglePause} aria-pressed={paused}>
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            {paused ? 'Reprendre' : 'Pause'}
          </Button>
        </div>
      </div>

      {/* Une seule région de statut : l'état du flux, jamais chaque ligne. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {paused && bufferedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-warning/10 px-4 py-2 text-sm">
          <span className="font-medium text-warning">
            {bufferedCount} événement{bufferedCount > 1 ? 's' : ''} en attente
          </span>
          <span className="text-muted-foreground">La pause ne perd rien : reprenez pour les afficher.</span>
          <Button variant="link" size="sm" className="px-0" onClick={resume}>
            Afficher maintenant
          </Button>
        </div>
      )}

      {notice && (
        <p role="alert" className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {notice}
        </p>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="off"
        aria-label={`Événements de la plateforme (${visible.length} ligne${visible.length > 1 ? 's' : ''})`}
        tabIndex={0}
        className="max-h-[32rem] min-h-48 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">Aucune activité enregistrée</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Les déploiements, inscriptions et actions d’administration apparaîtront ici en direct.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucun événement ne correspond à ces filtres.</p>
        ) : (
          <ol className="divide-y divide-border">
            {visible.map((event) => {
              const level = severityOf(event)
              const { title, detail } = describeEvent(event)
              const organizationName = event.organizationName ?? organizations.current[event.organizationId ?? ''] ?? null
              return (
                <li key={event.id} className="flex flex-col gap-1 px-4 py-2.5 sm:grid sm:grid-cols-[8.5rem_1fr] sm:gap-3">
                  <div className="flex items-center gap-2">
                    <time dateTime={event.createdAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatLiveClock(event.createdAt)}
                    </time>
                    <Badge variant={SEVERITY_BADGE[level]}>{SEVERITY_LABEL[level]}</Badge>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{title}</span>
                      {detail && <span className="text-muted-foreground"> — {detail}</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-mono [overflow-wrap:anywhere]">{event.type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{CATEGORY_LABEL[categoryOf(event.type)]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="[overflow-wrap:anywhere]">{organizationName ?? (event.organizationId ? `Organisation ${event.organizationId.slice(0, 8)}…` : 'Plateforme')}</span>
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Les {MAX_EVENTS} derniers événements restent affichés. L’historique serveur est conservé 24 h.
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => download('text')} disabled={visible.length === 0}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export texte
          </Button>
          <Button variant="outline" size="sm" onClick={() => download('csv')} disabled={visible.length === 0}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </div>
    </Card>
  )
}
