'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { auditActionLabel, formatLiveDate } from '@/lib/live-events'

export type AuditEntryView = {
  id: string
  action: string
  targetType: string
  targetId: string
  organizationId: string | null
  actorEmail: string
  details: Record<string, unknown>
  createdAt: string
}

const POLL_MS = 2_000
const MAX_ENTRIES = 200

const mergeEntries = (previous: readonly AuditEntryView[], incoming: readonly AuditEntryView[]): AuditEntryView[] => {
  const byId = new Map(previous.map((entry) => [entry.id, entry]))
  for (const entry of incoming) byId.set(entry.id, entry)
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ENTRIES)
}

/**
 * Tail du journal d'audit : les nouvelles entrées apparaissent toutes les 2 s sans
 * rechargement et sont marquées « Nouveau ». L'état du suivi est annoncé une fois par lot,
 * jamais ligne par ligne.
 */
export function AuditTail({ initial }: { initial: AuditEntryView[] }) {
  const [entries, setEntries] = useState<AuditEntryView[]>(initial)
  const [fresh, setFresh] = useState<string[]>([])
  const [state, setState] = useState<'live' | 'error'>('live')
  const [announcement, setAnnouncement] = useState('')
  const seen = useRef(new Set(initial.map((entry) => entry.id)))

  useEffect(() => {
    let disposed = false
    const tick = async () => {
      try {
        const response = await fetch('/api/admin/live/audit?limit=50', { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = (await response.json()) as { entries?: AuditEntryView[] }
        if (disposed) return
        const rows = body.entries ?? []
        const unseen = rows.filter((entry) => !seen.current.has(entry.id))
        for (const entry of unseen) seen.current.add(entry.id)
        if (unseen.length > 0) {
          setFresh((previous) => [...previous, ...unseen.map((entry) => entry.id)].slice(-MAX_ENTRIES))
          setAnnouncement(
            `${unseen.length} nouvelle${unseen.length > 1 ? 's' : ''} entrée${unseen.length > 1 ? 's' : ''} d’audit.`,
          )
        }
        setEntries((previous) => mergeEntries(previous, rows))
        setState('live')
      } catch {
        if (disposed) return
        setState('error')
        setAnnouncement('Le suivi du journal d’audit est interrompu. Rechargez la page pour reprendre.')
      }
    }

    const timer = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Dernières actions</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-full',
              state === 'live' ? 'bg-success animate-pulse motion-reduce:animate-none' : 'bg-destructive',
            )}
          />
          {state === 'live' ? 'Suivi en direct (2 s)' : 'Suivi interrompu'}
        </span>
      </div>

      {/* Région de statut séparée : un lot, jamais une ligne. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {entries.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-medium">Aucune action enregistrée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Les suspensions, réactivations et autres actions d’administration apparaîtront ici.
          </p>
        </div>
      ) : (
        <ol aria-label="Actions d’administration, de la plus récente à la plus ancienne" className="divide-y divide-border">
          {entries.map((entry) => {
            const details = entry.details ?? {}
            const isFresh = fresh.includes(entry.id)
            return (
              <li key={entry.id} className={cn('space-y-1 p-4', isFresh && 'bg-primary/5')}>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {auditActionLabel(entry.action)}
                  {typeof details.targetEmail === 'string' && <span className="font-normal">— {details.targetEmail}</span>}
                  {isFresh && <Badge>Nouveau</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  <time dateTime={entry.createdAt}>{formatLiveDate(entry.createdAt)}</time> · par {entry.actorEmail}
                </p>
                {typeof details.reason === 'string' && (
                  <p className="text-sm text-muted-foreground">Motif : {details.reason}</p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
