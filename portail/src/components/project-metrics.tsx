'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Cpu, HeartPulse, MemoryStick, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type MetricsApp = {
  id: string
  name: string
}

type MetricsPayload = {
  available: boolean
  cpuPercent: number | null
  memoryUsedMb: number | null
  memoryLimitMb: number | null
  memoryPercent: number | null
  sampledAt: string | null
  message?: string
}

type RuntimePayload = {
  available: boolean
  status: string | null
  healthCheckEnabled: boolean
  healthCheckPath: string | null
  restartCount: number | null
  lastRestartAt: string | null
  restartReason: string | null
  error?: string
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}

function formatMb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value >= 1024) {
    return `${(value / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`
  }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} Mo`
}

function clampPercent(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function statusLabel(status: string | null): string {
  if (!status) return 'Statut indisponible'
  if (status.startsWith('running')) return status.includes('unhealthy') ? 'En ligne (sonde en échec)' : 'En ligne'
  if (status.startsWith('restarting')) return 'Redémarrage en cours'
  if (status.startsWith('starting')) return 'Démarrage'
  if (status.startsWith('exited') || status.startsWith('stopped')) return 'Arrêtée'
  return status
}

function UsageBar({ value, label }: { value: number | null; label: string }) {
  const pct = clampPercent(value)
  const known = value !== null && Number.isFinite(value)
  return (
    <div
      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(pct) : undefined}
      aria-valuetext={known ? formatPercent(value) : 'Indisponible'}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${known ? 'bg-primary' : 'bg-muted-foreground/20'}`}
        style={{ width: known ? `${pct}%` : '100%' }}
      />
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  percent,
}: {
  icon: typeof Cpu
  label: string
  value: string
  detail?: string
  percent: number | null
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 font-mono text-lg font-semibold tabular-nums">{value}</dd>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      <UsageBar value={percent} label={label} />
    </div>
  )
}

/**
 * Métriques CPU/RAM et état runtime (Coolify), en mode dégradé si non exposés.
 * Rafraîchissement manuel uniquement pour éviter un polling agressif.
 */
export function ProjectMetrics({
  projectId,
  apps = [],
}: {
  projectId: string
  apps?: readonly MetricsApp[]
}) {
  const [selectedAppId, setSelectedAppId] = useState<string>(apps[0]?.id ?? '')
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [runtime, setRuntime] = useState<RuntimePayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const activeAppId = useMemo(() => {
    if (apps.length > 1) return selectedAppId || apps[0]?.id || ''
    return apps[0]?.id || ''
  }, [apps, selectedAppId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (apps.length > 1 && activeAppId) query.set('appId', activeAppId)
      const suffix = query.toString() ? `?${query.toString()}` : ''
      const response = await fetch(`/api/projects/${projectId}/metrics${suffix}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMetrics(null)
        setRuntime(null)
        setError(data.error ?? 'Métriques indisponibles.')
        return
      }
      setMetrics((data.metrics ?? null) as MetricsPayload | null)
      setRuntime((data.runtime ?? null) as RuntimePayload | null)
    } catch {
      setMetrics(null)
      setRuntime(null)
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }, [projectId, apps.length, activeAppId])

  useEffect(() => {
    void load()
  }, [load])

  const unavailableMessage =
    metrics && !metrics.available
      ? metrics.message || 'Métriques indisponibles.'
      : 'Métriques indisponibles.'

  return (
    <section
      aria-labelledby="project-metrics-title"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h2 id="project-metrics-title" className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            Ressources et état
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Utilisation CPU/mémoire et état runtime rapportés par l’hébergement, quand disponibles.
            {metrics?.sampledAt && metrics.available && (
              <span className="ml-1 tabular-nums">
                Échantillon : {new Date(metrics.sampledAt).toLocaleString('fr-FR')}.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {apps.length > 1 && (
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
              <span className="text-muted-foreground">Application</span>
              <select
                value={activeAppId}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="min-h-7 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Actualiser
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {!error && runtime && (
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <HeartPulse className="h-4 w-4 text-primary" aria-hidden="true" />
              État du conteneur
            </h3>
            {runtime.available ? (
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Statut détaillé</dt>
                  <dd className="font-medium">
                    {statusLabel(runtime.status)}{' '}
                    {runtime.status && (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">({runtime.status})</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Sonde de santé</dt>
                  <dd>{runtime.healthCheckEnabled ? runtime.healthCheckPath || 'Activée' : 'Non configurée'}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Redémarrages
                  </dt>
                  <dd className="tabular-nums">
                    {runtime.restartCount !== null ? runtime.restartCount : 'Non communiqué'}
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs text-muted-foreground">Dernier redémarrage</dt>
                  <dd>
                    {runtime.lastRestartAt
                      ? `${new Date(runtime.lastRestartAt).toLocaleString('fr-FR')}${runtime.restartReason ? ` · ${runtime.restartReason}` : ''}`
                      : runtime.restartReason || 'Aucune information fournie par l’hébergement.'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                État runtime indisponible pour le moment.{' '}
                {runtime.error ? <span className="text-warning">({runtime.error})</span> : null}
              </p>
            )}
          </div>
        )}

        {!error && loading && !metrics && (
          <p className="text-sm text-muted-foreground">Chargement des métriques…</p>
        )}

        {!error && metrics?.available && (
          <dl className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={Cpu}
              label="Processeur"
              value={formatPercent(metrics.cpuPercent)}
              detail="Utilisation instantanée du CPU (barre indicative)."
              percent={metrics.cpuPercent}
            />
            <MetricCard
              icon={MemoryStick}
              label="Mémoire"
              value={formatPercent(metrics.memoryPercent)}
              detail={
                metrics.memoryUsedMb !== null || metrics.memoryLimitMb !== null
                  ? `${formatMb(metrics.memoryUsedMb)} utilisés sur ${formatMb(metrics.memoryLimitMb)}`
                  : 'Consommation mémoire rapportée.'
              }
              percent={metrics.memoryPercent}
            />
          </dl>
        )}

        {!error && metrics && !metrics.available && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {unavailableMessage}
          </p>
        )}

        {!error && metrics?.available && (metrics.cpuPercent === null || metrics.memoryPercent === null) && (
          <p className="text-xs text-muted-foreground">
            Certaines valeurs ne sont pas exposées par l’hébergement : l’affichage se dégrade sans bloquer les autres informations.
          </p>
        )}
      </div>
    </section>
  )
}
