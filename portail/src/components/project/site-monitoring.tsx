'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Globe, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Monitor = {
  id: string
  host: string
  label: string | null
  enabled: boolean
  lastCheckedAt: string | null
  lastStatus: string
  lastHttpStatus: number | null
  lastLatencyMs: number | null
  lastDnsOk: boolean | null
  lastTlsOk: boolean | null
  lastTlsExpiresAt: string | null
  lastError: string | null
  hasOpenIncident: boolean
}

type Incident = {
  id: string
  host: string
  status: string
  cause: string | null
  summary: string
  details: string | null
  openedAt: string
  resolvedAt: string | null
}

const dt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : dt.format(d)
}

function causeLabel(cause: string | null): string {
  switch (cause) {
    case 'dns': return 'DNS'
    case 'tls': return 'TLS'
    case 'http': return 'HTTP'
    case 'timeout': return 'Délai dépassé'
    case 'network': return 'Réseau'
    default: return 'Indisponibilité'
  }
}

function statusMeta(monitor: Monitor): { label: string; tone: string; dot: string } {
  if (monitor.hasOpenIncident || monitor.lastStatus === 'down') {
    return { label: 'Incident en cours', tone: 'text-destructive', dot: 'bg-destructive' }
  }
  if (monitor.lastStatus === 'up') {
    return { label: 'En ligne', tone: 'text-success', dot: 'bg-success' }
  }
  return { label: 'En attente de contrôle', tone: 'text-muted-foreground', dot: 'bg-muted-foreground/50' }
}

export function SiteMonitoringPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ monitors: Monitor[]; incidents: Incident[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/monitoring`, { cache: 'no-store' })
      const body = (await response.json().catch(() => ({}))) as { monitors?: Monitor[]; incidents?: Incident[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Impossible de charger la surveillance.')
      setData({ monitors: body.monitors ?? [], incidents: body.incidents ?? [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la surveillance.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const monitors = data?.monitors ?? []
  const incidents = data?.incidents ?? []
  const openCount = incidents.filter((i) => i.status === 'open').length

  return (
    <section aria-labelledby="site-monitoring-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 id="site-monitoring-title" className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            Surveillance des sites
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Contrôles continus HTTP, DNS et TLS sur les domaines connus. Les incidents sont confirmés avant alerte et signalés à leur rétablissement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {openCount} incident{openCount > 1 ? 's' : ''} ouvert{openCount > 1 ? 's' : ''}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualiser
          </Button>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!loading && !error && monitors.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Aucun domaine public à surveiller pour le moment. La surveillance démarre automatiquement quand une application expose un domaine ou qu’un domaine personnalisé est vérifié.
          </p>
        )}

        {monitors.length > 0 && (
          <ul className="space-y-3" aria-label="Domaines surveillés">
            {monitors.map((monitor) => {
              const meta = statusMeta(monitor)
              return (
                <li key={monitor.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate font-mono text-xs sm:text-sm">{monitor.host}</span>
                      </p>
                      {monitor.label && <p className="mt-0.5 text-xs text-muted-foreground">{monitor.label}</p>}
                    </div>
                    <p className={cn('inline-flex items-center gap-1.5 text-sm font-medium', meta.tone)}>
                      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', meta.dot)} />
                      {meta.label}
                    </p>
                  </div>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="inline">Dernière vérification : </dt>
                      <dd className="inline font-medium text-foreground">{formatDate(monitor.lastCheckedAt)}</dd>
                    </div>
                    <div>
                      <dt className="inline">HTTP : </dt>
                      <dd className="inline font-medium text-foreground">
                        {monitor.lastHttpStatus ?? '—'}
                        {typeof monitor.lastLatencyMs === 'number' ? ` · ${monitor.lastLatencyMs} ms` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">DNS : </dt>
                      <dd className="inline font-medium text-foreground">
                        {monitor.lastDnsOk == null ? '—' : monitor.lastDnsOk ? 'OK' : 'Échec'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">TLS : </dt>
                      <dd className="inline font-medium text-foreground">
                        {monitor.lastTlsOk == null ? '—' : monitor.lastTlsOk ? 'Valide' : 'Invalide'}
                        {monitor.lastTlsExpiresAt ? ` (expire le ${dateOnly.format(new Date(monitor.lastTlsExpiresAt))})` : ''}
                      </dd>
                    </div>
                  </dl>
                  {monitor.lastError && (monitor.hasOpenIncident || monitor.lastStatus === 'down') && (
                    <p className="mt-2 flex items-start gap-2 rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{monitor.lastError}</span>
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Historique des incidents
          </h3>
          {incidents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Aucun incident enregistré.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {incidents.map((incident) => {
                const open = incident.status === 'open'
                return (
                  <li key={incident.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {open ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        )}
                        <span className="font-mono text-xs">{incident.host}</span>
                        <span className="rounded-full border border-border px-1.5 text-xs font-normal text-muted-foreground">
                          {causeLabel(incident.cause)}
                        </span>
                        <span className={cn('text-xs font-medium', open ? 'text-destructive' : 'text-success')}>
                          {open ? 'Ouvert' : 'Résolu'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{incident.summary}</p>
                      {incident.details && open && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{incident.details}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ouvert le <time dateTime={incident.openedAt}>{formatDate(incident.openedAt)}</time>
                        {incident.resolvedAt && (
                          <> · Résolu le <time dateTime={incident.resolvedAt}>{formatDate(incident.resolvedAt)}</time></>
                        )}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
