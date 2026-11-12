'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, Cpu, HardDrive, Info, MemoryStick, RefreshCw, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type UsageProject = {
  id: string
  name: string
  apps: Array<{ id: string; name: string; deployed: boolean }>
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

type Sample = {
  key: string
  projectId: string
  projectName: string
  appId: string
  appName: string
  loading: boolean
  error: string | null
  metrics: MetricsPayload | null
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}

function formatMemory(usedMb: number | null, limitMb: number | null): string {
  if (usedMb === null || !Number.isFinite(usedMb)) return '—'
  const fmt = (mb: number) =>
    mb >= 1024
      ? `${(mb / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`
      : `${mb.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} Mo`
  if (limitMb !== null && Number.isFinite(limitMb)) {
    return `${fmt(usedMb)} / ${fmt(limitMb)}`
  }
  return fmt(usedMb)
}

function Meter({ value, label }: { value: number | null; label: string }) {
  const known = value !== null && Number.isFinite(value)
  const pct = known ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div
      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(pct) : undefined}
      aria-valuetext={known ? formatPercent(value) : 'Indisponible'}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', known ? 'bg-primary' : 'bg-muted-foreground/20')}
        style={{ width: known ? `${pct}%` : '100%' }}
      />
    </div>
  )
}

function UnavailableResource({ icon: Icon, label, reason }: { icon: typeof HardDrive; label: string; reason: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium text-muted-foreground">Non disponible</dd>
      <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
    </div>
  )
}

export function UsageView({ projects }: { projects: UsageProject[] }) {
  const targets = useMemo(
    () =>
      projects.flatMap((project) =>
        project.apps
          .filter((app) => app.deployed)
          .map((app) => ({
            key: `${project.id}:${app.id || 'primary'}`,
            projectId: project.id,
            projectName: project.name,
            appId: app.id,
            appName: app.name,
          })),
      ),
    [projects],
  )

  const [samples, setSamples] = useState<Sample[]>(() =>
    targets.map((t) => ({ ...t, loading: true, error: null, metrics: null })),
  )

  useEffect(() => {
    setSamples(targets.map((t) => ({ ...t, loading: true, error: null, metrics: null })))
  }, [targets])

  const fetchOne = useCallback(async (target: (typeof targets)[number]): Promise<Partial<Sample>> => {
    try {
      const query = target.appId ? `?appId=${encodeURIComponent(target.appId)}` : ''
      const response = await fetch(`/api/projects/${target.projectId}/metrics${query}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { loading: false, error: data.error ?? 'Métriques indisponibles.', metrics: null }
      }
      return { loading: false, error: null, metrics: (data.metrics ?? null) as MetricsPayload | null }
    } catch {
      return { loading: false, error: 'Impossible de contacter le serveur.', metrics: null }
    }
  }, [])

  const refresh = useCallback(async () => {
    setSamples(targets.map((t) => ({ ...t, loading: true, error: null, metrics: null })))
    // Concurrence bornée pour éviter de surcharger l'hébergement.
    const queue = [...targets]
    const run = async () => {
      for (;;) {
        const next = queue.shift()
        if (!next) return
        const patch = await fetchOne(next)
        setSamples((prev) => prev.map((s) => (s.key === next.key ? { ...s, ...patch } : s)))
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, targets.length || 1) }, () => run()))
  }, [targets, fetchOne])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const loading = samples.some((s) => s.loading)
  const sampledAt = samples.map((s) => s.metrics?.sampledAt).find((v): v is string => Boolean(v)) ?? null

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-balance">Utilisation et ressources</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Mesures réelles rapportées par l’hébergement, quand elles sont disponibles. Les valeurs CPU et mémoire sont des
            échantillons <strong className="font-medium text-foreground">instantanés</strong> (pas un cumul mensuel) ; la
            période exacte dépend du dernier relevé exposé par l’hébergement.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </Button>
      </header>

      <section aria-labelledby="usage-source-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="usage-source-title" className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-primary" aria-hidden="true" />
          Sources et unités
        </h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li><span className="font-medium text-foreground">CPU</span> : pourcentage d’utilisation instantané, source hébergement (Coolify), quand exposé.</li>
          <li><span className="font-medium text-foreground">Mémoire</span> : mémoire utilisée (Mo/Go) et limite si connue, source hébergement (Coolify), quand exposé.</li>
          <li><span className="font-medium text-foreground">Stockage</span> : aucune source de mesure disponible pour le moment — aucune valeur affichée.</li>
          <li><span className="font-medium text-foreground">Bande passante</span> : aucune source de mesure disponible pour le moment — aucune valeur affichée.</li>
        </ul>
        {sampledAt && (
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            Dernier échantillon reçu : {new Date(sampledAt).toLocaleString('fr-FR')}.
          </p>
        )}
      </section>

      <section aria-labelledby="usage-unavailable-title">
        <h2 id="usage-unavailable-title" className="sr-only">Ressources sans source de mesure</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <UnavailableResource
            icon={HardDrive}
            label="Stockage"
            reason="Aucune source de mesure documentée. Le stockage utilisé par les applications/volumes n’est pas encore collecté."
          />
          <UnavailableResource
            icon={Wifi}
            label="Bande passante"
            reason="Aucune source de mesure documentée. La bande passante n’est pas exposée par l’hébergement actuel."
          />
        </dl>
      </section>

      <section aria-labelledby="usage-apps-title" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="usage-apps-title" className="text-base font-semibold">CPU et mémoire par application</h2>
          <p className="text-xs text-muted-foreground">Échantillon instantané · {targets.length} application{targets.length > 1 ? 's' : ''} déployée{targets.length > 1 ? 's' : ''}</p>
        </div>

        {targets.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-medium">Aucune application déployée</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Les métriques CPU et mémoire apparaîtront ici après le premier déploiement réussi d’une application, si l’hébergement les expose.
            </p>
            <div className="mt-4">
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-[background-color,color,box-shadow,border-color,transform] duration-200 ease-out-expo hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:h-11"
              >
                Voir les projets
              </Link>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {samples.map((sample) => {
              const m = sample.metrics
              const unavailable = !sample.loading && !sample.error && m && !m.available
              return (
                <li key={sample.key} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{sample.projectName}</p>
                      <p className="truncate text-xs text-muted-foreground">{sample.appName}</p>
                    </div>
                    <Link
                      href={`/dashboard/projects/${sample.projectId}`}
                      className="shrink-0 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      Voir le projet
                    </Link>
                  </div>

                  {sample.loading ? (
                    <p className="mt-4 text-sm text-muted-foreground">Chargement des mesures…</p>
                  ) : sample.error ? (
                    <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                      {sample.error}
                    </p>
                  ) : unavailable ? (
                    <p className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                      {m?.message || 'Métriques CPU/mémoire indisponibles : l’hébergement ne les expose pas pour cette application.'}
                    </p>
                  ) : m ? (
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background p-3">
                        <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
                          CPU (instantané)
                        </dt>
                        <dd className="mt-1 font-mono text-base font-semibold tabular-nums">{formatPercent(m.cpuPercent)}</dd>
                        <Meter value={m.cpuPercent} label="Utilisation CPU instantanée" />
                      </div>
                      <div className="rounded-lg border border-border bg-background p-3">
                        <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <MemoryStick className="h-4 w-4 shrink-0" aria-hidden="true" />
                          Mémoire (instantané)
                        </dt>
                        <dd className="mt-1 font-mono text-base font-semibold tabular-nums">
                          {formatMemory(m.memoryUsedMb, m.memoryLimitMb)}
                        </dd>
                        {m.memoryPercent !== null && (
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{formatPercent(m.memoryPercent)} utilisée</p>
                        )}
                        <Meter value={m.memoryPercent} label="Utilisation mémoire instantanée" />
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">Aucune mesure disponible.</p>
                  )}

                  {m?.sampledAt && (
                    <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                      Échantillon : {new Date(m.sampledAt).toLocaleString('fr-FR')} · source : hébergement
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Aucune valeur n’est affichée sans source de mesure. Le stockage et la bande passante nécessitent une instrumentation dédiée (non disponible actuellement).
        </span>
      </p>
    </div>
  )
}
