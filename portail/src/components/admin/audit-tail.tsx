'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { auditActionLabel, formatLiveDate } from '@/lib/live-events'
import {
  AUDIT_CATEGORY_LABEL,
  auditActionCategory,
  auditDetailEntries,
  auditTailQuery,
  auditTargetHref,
  auditTargetLabel,
  matchesAuditFilters,
  type AuditQuery,
} from '@/lib/admin-audit'

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
 * rechargement et sont marquées « Nouveau ». Le suivi reprend les mêmes filtres que
 * la page ; l'état est annoncé une fois par lot, jamais ligne par ligne.
 */
export function AuditTail({ initial, filters }: { initial: AuditEntryView[]; filters: AuditQuery }) {
  const [entries, setEntries] = useState<AuditEntryView[]>(initial)
  const [fresh, setFresh] = useState<string[]>([])
  const [state, setState] = useState<'live' | 'error'>('live')
  const [announcement, setAnnouncement] = useState('')
  const seen = useRef(new Set(initial.map((entry) => entry.id)))
  const queryString = auditTailQuery(filters)

  // Une navigation (nouveaux filtres) fournit une nouvelle liste initiale : on la
  // fusionne sans écraser les entrées déjà reçues en direct.
  useEffect(() => {
    for (const entry of initial) seen.current.add(entry.id)
    setEntries((previous) => mergeEntries(previous, initial))
  }, [initial])

  useEffect(() => {
    let disposed = false
    const tick = async () => {
      try {
        const response = await fetch(`/api/admin/live/audit?${queryString}`, { cache: 'no-store' })
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
  }, [queryString])

  const filtered = filters.action !== null || filters.actor !== '' || filters.target !== '' || filters.days > 0
  // Les entrées déjà chargées peuvent provenir d'un filtre précédent : on ne les
  // affiche que si elles correspondent encore au filtre courant.
  const visibleEntries = entries.filter((entry) => matchesAuditFilters(entry, filters))

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Dernières actions</h2>
          <span className="text-xs text-muted-foreground">
            {visibleEntries.length} entrée{visibleEntries.length > 1 ? 's' : ''}
            {filtered ? ` filtrée${visibleEntries.length > 1 ? 's' : ''}` : ''}
          </span>
        </div>
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

      {visibleEntries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? 'Aucune action ne correspond aux filtres' : 'Aucune action enregistrée'}
          description={
            filtered
              ? 'Élargissez la période, changez l’action ou videz la recherche d’acteur ou de cible.'
              : 'Les suspensions, réactivations et autres actions d’administration apparaîtront ici.'
          }
        />
      ) : (
        <ol aria-label="Actions d’administration, de la plus récente à la plus ancienne" className="divide-y divide-border">
          {visibleEntries.map((entry) => {
            const isFresh = fresh.includes(entry.id)
            const category = auditActionCategory(entry.action)
            const detailRows = auditDetailEntries(entry.details)
            const targetHref = auditTargetHref(entry.targetType, entry.targetId)
            return (
              <li key={entry.id} className={cn('space-y-2 p-4', isFresh && 'bg-primary/5')}>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{auditActionLabel(entry.action)}</span>
                  <Badge variant="outline">{AUDIT_CATEGORY_LABEL[category]}</Badge>
                  {isFresh ? <Badge>Nouveau</Badge> : null}
                </p>

                <p className="text-xs text-muted-foreground">
                  <time dateTime={entry.createdAt}>{formatLiveDate(entry.createdAt)}</time>
                  {' · '}Acteur : <span className="font-mono text-foreground">{entry.actorEmail}</span>
                </p>

                <p className="text-xs text-muted-foreground">
                  Cible : {auditTargetLabel(entry.targetType)}{' '}
                  <span className="font-mono text-foreground">{entry.targetId}</span>
                  {targetHref ? (
                    <>
                      {' · '}
                      <Link
                        href={targetHref}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                      >
                        Voir la fiche
                      </Link>
                    </>
                  ) : null}
                  {entry.organizationId ? (
                    <>
                      {' · '}Organisation <span className="font-mono">{entry.organizationId}</span>
                    </>
                  ) : null}
                </p>

                {detailRows.length > 0 ? (
                  <details className="group">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0">
                      Détails ({detailRows.length})
                    </summary>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                      {detailRows.map((row) => (
                        <div key={row.key} className="min-w-0">
                          <dt className="text-muted-foreground">{row.label}</dt>
                          <dd className="break-words font-medium text-foreground [overflow-wrap:anywhere]">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
