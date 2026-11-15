'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, ExternalLink, Info, RefreshCw, ShieldCheck } from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section'
import { EmptyState } from '@/components/ui/empty-state'
import { Notice } from '@/components/dashboard/notice'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'

type AnalyticsConfig = {
  enabled: boolean
  publicKey: string | null
  respectDnt: boolean
  collectPath: boolean
  retentionDays: number
  snippet: string | null
  snippetConsent: string | null
  collectUrl: string
  createdAt: string | null
  updatedAt: string | null
}

type StatsPayload = {
  rangeDays: number
  total: number
  days: { date: string; views: number }[]
  paths: { path: string; views: number }[]
}

const PERIODS = [7, 14, 30, 90] as const

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })

function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return dateFormat.format(d)
}

export function ProjectAnalyticsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [config, setConfig] = useState<AnalyticsConfig | null>(null)
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showConsentSnippet, setShowConsentSnippet] = useState(false)

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) setRefreshing(true)
      else setLoading(true)
      setError('')
      try {
        const [configRes, statsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/analytics`, { cache: 'no-store' }),
          fetch(`/api/projects/${projectId}/analytics/stats?days=${days}`, { cache: 'no-store' }),
        ])
        const configData = await configRes.json().catch(() => ({}))
        const statsData = await statsRes.json().catch(() => ({}))
        if (!configRes.ok) {
          throw new Error(configData.error ?? 'Impossible de charger la configuration analytique.')
        }
        if (!statsRes.ok) {
          throw new Error(statsData.error ?? 'Impossible de charger les statistiques.')
        }
        setConfig((configData.config ?? null) as AnalyticsConfig | null)
        setStats(statsData as StatsPayload)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de contacter le serveur.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [projectId, days],
  )

  useEffect(() => {
    void load()
  }, [load])

  const toggleEnabled = async (enabled: boolean) => {
    if (!canManage) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Modification impossible.')
      setConfig((data.config ?? null) as AnalyticsConfig | null)
      setNotice(enabled ? 'Mesure d’audience activée pour ce projet.' : 'Mesure d’audience désactivée pour ce projet.')
      await load({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Modification impossible.')
    } finally {
      setSaving(false)
    }
  }

  const maxDayViews = useMemo(() => Math.max(1, ...(stats?.days.map((d) => d.views) ?? [1])), [stats])

  const hasData = (stats?.total ?? 0) > 0
  const configured = config !== null
  const enabled = config?.enabled === true
  const snippet = showConsentSnippet ? config?.snippetConsent : config?.snippet

  if (loading) {
    return (
      <SectionCard
        id="analytics"
        title="Analytique"
        icon={BarChart3}
        description="Statistiques de fréquentation agrégées issues des données réellement collectées."
      >
        <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">Chargement des données analytiques…</p>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-6">
      <SectionCard
        id="analytics"
        title="Analytique"
        icon={BarChart3}
        description="Pages vues agrégées mesurées par EFLEX, sans cookie, sans identifiant visiteur et sans profilage nominatif. Aucune donnée inventée : seules les pages vues effectivement reçues sont comptabilisées."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
              <span className="text-muted-foreground">Période</span>
              <select
                value={String(days)}
                onChange={(e) => setDays(Number(e.target.value))}
                className="min-h-7 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Période des statistiques"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p} jours
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => void load({ silent: true })} loading={refreshing}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Actualiser
            </Button>
          </div>
        }
      >
        <div className="space-y-4 px-4 py-4 sm:px-5">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground">
              {notice}
            </p>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {enabled ? 'Mesure d’audience activée' : 'Mesure d’audience désactivée'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {enabled
                    ? 'Les pages vues reçues depuis vos sites intégrés sont agrégées par jour et par chemin.'
                    : 'Aucune collecte n’a lieu tant que la mesure n’est pas activée. Les données affichées ci-dessous correspondent uniquement aux statistiques déjà conservées, le cas échéant.'}
                </p>
                {config && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>Rétention : <span className="tabular-nums">{config.retentionDays}</span> jours</li>
                    <li>Respect DNT/GPC : {config.respectDnt ? 'activé' : 'désactivé'}</li>
                    <li>Collecte du chemin : {config.collectPath ? 'activée' : 'désactivée (compteur global)'}</li>
                  </ul>
                )}
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant={enabled ? 'outline' : 'primary'}
                  size="sm"
                  onClick={() => void toggleEnabled(!enabled)}
                  loading={saving}
                >
                  {enabled ? 'Désactiver la collecte' : 'Activer la collecte'}
                </Button>
              )}
            </div>
            {!canManage && !enabled && (
              <p className="mt-3 text-sm text-muted-foreground">
                Un propriétaire ou un administrateur du projet peut activer la mesure et accéder à l’intégration.
              </p>
            )}
          </div>

          {!enabled && !hasData && (
            <EmptyState
              icon={BarChart3}
              title="Collecte non activée"
              description={
                canManage
                  ? 'Activez la mesure d’audience pour ce projet, puis intégrez le snippet sur votre site. Les statistiques apparaîtront ici après réception d’événements réels.'
                  : 'La mesure d’audience n’est pas activée pour ce projet. Lorsqu’elle le sera et que des événements auront été reçus, les statistiques agrégées apparaîtront ici.'
              }
              className="py-8"
            />
          )}

          {hasData && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Pages vues (agrégées)</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{stats?.total.toLocaleString('fr-FR')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sur les {stats?.rangeDays} derniers jours (donnée mesurée)</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Pages distinctes</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{(stats?.paths.length ?? 0).toLocaleString('fr-FR')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Chemins ayant reçu au moins une vue sur la période</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Jours avec activité</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{(stats?.days.length ?? 0).toLocaleString('fr-FR')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Jours ayant enregistré au moins une page vue</p>
                </div>
              </div>

              <Notice tone="info" title="Métriques disponibles">
                Ce tableau de bord affiche uniquement les indicateurs issus des données réelles collectées : pages vues agrégées, évolution quotidienne et chemins les plus consultés. Les visiteurs uniques, sessions, durée de visite et taux de rebond ne sont pas mesurés par ce dispositif et ne sont donc pas affichés.
              </Notice>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold">Évolution sur la période</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Pages vues agrégées par jour (UTC).</p>
                  {stats && stats.days.length > 0 ? (
                    <ul className="mt-4 space-y-2" aria-label="Pages vues par jour">
                      {stats.days.map((day) => (
                        <li key={day.date} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{formatDay(day.date)}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(2, (day.views / maxDayViews) * 100)}%` }}
                            />
                          </div>
                          <span className="text-right font-mono text-xs tabular-nums">{day.views.toLocaleString('fr-FR')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">Aucune activité sur la période sélectionnée.</p>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold">Pages les plus consultées</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Chemins classés par nombre de pages vues sur la période.</p>
                  {stats && stats.paths.length > 0 ? (
                    <ol className="mt-4 space-y-2" aria-label="Pages les plus consultées">
                      {stats.paths.map((row, index) => (
                        <li key={row.path} className="flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="mr-2 inline-block w-5 text-right font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                            <span className="break-all font-mono text-xs sm:text-sm">{row.path}</span>
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{row.views.toLocaleString('fr-FR')}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">Aucun chemin enregistré sur la période.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {enabled && !hasData && (
            <EmptyState
              icon={Info}
              title="Aucune donnée collectée sur la période"
              description="La mesure est activée, mais aucun événement de page vue n’a encore été reçu pour la période sélectionnée. Vérifiez que le snippet est intégré sur votre site et que des visites ont bien eu lieu (en respectant, le cas échéant, le consentement et les signaux DNT/GPC)."
              className="py-8"
            />
          )}

          {configured && (snippet || canManage) && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Intégration</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ajoutez le snippet sur les pages de votre site pour mesurer les pages vues. Le mode conditionné n’émet rien sans consentement explicite.
                  </p>
                </div>
                {snippet && <CopyButton value={snippet} label="Copier le snippet" />}
              </div>

              {snippet ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConsentSnippet(false)}
                      className={`min-h-9 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 ${!showConsentSnippet ? 'border-foreground bg-muted font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      aria-pressed={!showConsentSnippet}
                    >
                      Émission immédiate
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConsentSnippet(true)}
                      className={`min-h-9 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 ${showConsentSnippet ? 'border-foreground bg-muted font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      aria-pressed={showConsentSnippet}
                    >
                      Conditionné au consentement
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                    <code>{snippet}</code>
                  </pre>
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Point de collecte : <span className="font-mono">{config?.collectUrl}</span>. Aucune donnée n’est envoyée tant que le snippet n’est pas intégré (et, en mode conditionné, tant que le consentement n’est pas recueilli).
                    </span>
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {canManage
                    ? 'Activez la collecte pour générer un snippet d’intégration propre à ce projet.'
                    : 'Le snippet d’intégration sera disponible une fois la collecte configurée par un gestionnaire.'}
                </p>
              )}

              <p className="mt-3 text-xs text-muted-foreground">
                Référence :{' '}
                <a
                  href="https://github.com/digitaleflex/eflex/blob/main/docs/operations/analytics.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  documentation de la mesure d’audience
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
