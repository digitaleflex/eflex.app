'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  ExternalLink,
  Flag,
  Info,
  KeyRound,
  ListChecks,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Signal,
  Trash2,
  X,
} from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section'
import { EmptyState } from '@/components/ui/empty-state'
import { Notice } from '@/components/dashboard/notice'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CopyButton } from '@/components/ui/copy-button'

type AnalyticsConfig = {
  enabled: boolean
  publicKey: string | null
  respectDnt: boolean
  collectPath: boolean
  collectReferrer?: boolean
  collectDevice?: boolean
  retentionDays: number
  goalEvents: string[]
  lastReceivedAt: string | null
  snippet: string | null
  snippetConsent: string | null
  eventSnippet: string | null
  collectUrl: string
  createdAt: string | null
  updatedAt: string | null
}

type EventStat = { name: string; count: number; goal: boolean }
type DimensionStat = { value: string; views: number; visitors: number }

type StatsPayload = {
  rangeDays: number
  total: number
  totalVisitors?: number
  visitorsAggregation?: string
  days: { date: string; views: number; visitors?: number }[]
  paths: { path: string; views: number }[]
  events: EventStat[]
  referrers?: DimensionStat[]
  devices?: DimensionStat[]
  browsers?: DimensionStat[]
  operatingSystems?: DimensionStat[]
  goalEvents: string[]
  comparison?: {
    previousTotal: number
    previousActiveDays: number
    changePct: number
    previousVisitors?: number
    visitorsChangePct?: number
    previousEvents: number
  }
  installation?: { enabled: boolean; lastReceivedAt: string | null }
}

const PERIODS = [7, 14, 30, 90] as const
const EVENT_NAME_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/
const GOAL_EVENTS_MAX = 20

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return dateFormat.format(d)
}

function formatDateTime(value: string | null): string {
  if (!value) return 'jamais'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'jamais'
  return dateTimeFormat.format(d)
}

function Trend({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />+{value}%
      </span>
    )
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />{value}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Minus className="h-3.5 w-3.5" aria-hidden="true" />0%
    </span>
  )
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
  const [goalInput, setGoalInput] = useState('')
  const [goalDraft, setGoalDraft] = useState<string[]>([])
  const [savingGoals, setSavingGoals] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)

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
        if (!configRes.ok) throw new Error(configData.error ?? 'Impossible de charger la configuration analytique.')
        if (!statsRes.ok) throw new Error(statsData.error ?? 'Impossible de charger les statistiques.')
        const nextConfig = (configData.config ?? null) as AnalyticsConfig | null
        const nextStats = statsData as StatsPayload
        setConfig(nextConfig)
        setStats(nextStats)
        setGoalDraft(nextConfig?.goalEvents ?? nextStats.goalEvents ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de contacter le serveur.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [projectId, days],
  )

  useEffect(() => { void load() }, [load])

  const updateConfig = async (patch: Record<string, unknown>, successNotice: string) => {
    if (!canManage) return
    setSaving(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Modification impossible.')
      setConfig((data.config ?? null) as AnalyticsConfig | null)
      setNotice(successNotice)
      await load({ silent: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible.') }
    finally { setSaving(false) }
  }

  const toggleEnabled = async (enabled: boolean) => {
    await updateConfig({ enabled }, enabled ? 'Mesure d’audience activée pour ce projet.' : 'Mesure d’audience désactivée pour ce projet.')
  }

  const addGoal = () => {
    const normalized = goalInput.trim().toLowerCase()
    if (!normalized) return
    if (!EVENT_NAME_PATTERN.test(normalized)) { setError('Nom d’objectif invalide : utilisez des lettres/chiffres minuscules, . _ : - (sans espace).'); return }
    if (goalDraft.includes(normalized)) { setGoalInput(''); return }
    if (goalDraft.length >= GOAL_EVENTS_MAX) { setError(`Vous pouvez définir au plus ${GOAL_EVENTS_MAX} objectifs.`); return }
    setError(''); setGoalDraft((prev) => [...prev, normalized]); setGoalInput('')
  }
  const removeGoal = (name: string) => setGoalDraft((prev) => prev.filter((g) => g !== name))

  const saveGoals = async () => {
    if (!canManage) return
    setSavingGoals(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goalEvents: goalDraft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Impossible d’enregistrer les objectifs.')
      setConfig((data.config ?? null) as AnalyticsConfig | null)
      setNotice('Objectifs de conversion mis à jour.')
      await load({ silent: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible d’enregistrer les objectifs.') }
    finally { setSavingGoals(false) }
  }

  const deleteStats = async () => {
    if (!canManage) return
    setDeleting(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics/stats`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Suppression impossible.')
      const count = typeof data.deleted === 'number' ? data.deleted : 0
      setConfirmDelete(false)
      setNotice(`Statistiques supprimées (${count.toLocaleString('fr-FR')} ligne(s) agrégée(s) effacée(s)).`)
      await load({ silent: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Suppression impossible.') }
    finally { setDeleting(false) }
  }

  const rotateKey = async () => {
    if (!canManage) return
    setRotating(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerateKey: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Rotation de la clé impossible.')
      setConfig((data.config ?? null) as AnalyticsConfig | null)
      setConfirmRotate(false)
      setNotice('Nouvelle clé de mesure générée. Mettez à jour les snippets intégrés sur vos sites.')
      await load({ silent: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Rotation de la clé impossible.') }
    finally { setRotating(false) }
  }

  const downloadExport = async (format: 'json' | 'csv') => {
    if (!canManage) return
    setExporting(format); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/analytics/export?format=${format}`, { cache: 'no-store' })
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error ?? 'Export impossible.') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `analytics-${projectId}.${format}`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      setNotice(`Export ${format.toUpperCase()} téléchargé.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Export impossible.') }
    finally { setExporting(null) }
  }

  const maxDayViews = useMemo(() => Math.max(1, ...(stats?.days.map((d) => d.views) ?? [1])), [stats])
  const totalVisitors = stats?.totalVisitors ?? 0
  const hasPageData = (stats?.total ?? 0) > 0
  const events = stats?.events ?? []
  const hasEventData = events.length > 0
  const configured = config !== null
  const enabled = config?.enabled === true
  const snippet = showConsentSnippet ? config?.snippetConsent : config?.snippet
  const goalEvents = config?.goalEvents ?? stats?.goalEvents ?? []
  const goalsDirty = JSON.stringify(goalDraft) !== JSON.stringify(goalEvents)
  const lastReceivedAt = config?.lastReceivedAt ?? stats?.installation?.lastReceivedAt ?? null
  const comparison = stats?.comparison
  const goalEventStats = events.filter((e) => e.goal)

  if (loading) {
    return (
      <SectionCard id="analytics" title="Analytique" icon={BarChart3} description="Statistiques de fréquentation agrégées issues des données réellement collectées.">
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
        description="Pages vues et événements nommés agrégés mesurés par EFLEX, sans cookie, sans identifiant visiteur et sans profilage nominatif. Aucune donnée inventée : seules les mesures effectivement reçues sont comptabilisées."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
              <span className="text-muted-foreground">Période</span>
              <select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="min-h-7 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Période des statistiques">
                {PERIODS.map((p) => (<option key={p} value={p}>{p} jours</option>))}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => void load({ silent: true })} loading={refreshing}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Actualiser
            </Button>
          </div>
        }
      >
        <div className="space-y-4 px-4 py-4 sm:px-5">
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && !error && <p role="status" className="rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground">{notice}</p>}

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{enabled ? 'Mesure d’audience activée' : 'Mesure d’audience désactivée'}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {enabled
                    ? 'Les pages vues, visiteurs uniques, sources, appareils/navigateurs/OS (si activés) et événements nommés reçus sont agrégés par jour.'
                    : 'Aucune collecte n’a lieu tant que la mesure n’est pas activée. Les données affichées ci-dessous correspondent uniquement aux statistiques déjà conservées, le cas échéant.'}
                </p>
                {config && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>Rétention : <span className="tabular-nums">{config.retentionDays}</span> jours</li>
                    <li>Respect DNT/GPC : {config.respectDnt ? 'activé' : 'désactivé'}</li>
                    <li>Collecte du chemin : {config.collectPath ? 'activée' : 'désactivée (compteur global)'}</li>
                    <li className="flex flex-wrap items-center gap-2">
                      <span>Référents/sources : {config.collectReferrer !== false ? 'activés' : 'désactivés'}</span>
                      {canManage && (
                        <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => void updateConfig({ collectReferrer: !(config.collectReferrer !== false) }, !(config.collectReferrer !== false) ? 'Collecte des référents activée.' : 'Collecte des référents désactivée.')} disabled={saving}>
                          {config.collectReferrer !== false ? 'Désactiver' : 'Activer'}
                        </button>
                      )}
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <span>Appareil/navigateur/OS : {config.collectDevice !== false ? 'activés' : 'désactivés'}</span>
                      {canManage && (
                        <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => void updateConfig({ collectDevice: !(config.collectDevice !== false) }, !(config.collectDevice !== false) ? 'Collecte appareil/navigateur/OS activée.' : 'Collecte appareil/navigateur/OS désactivée.')} disabled={saving}>
                          {config.collectDevice !== false ? 'Désactiver' : 'Activer'}
                        </button>
                      )}
                    </li>
                    <li>Objectifs définis : <span className="tabular-nums">{goalEvents.length}</span></li>
                  </ul>
                )}
              </div>
              {canManage && (
                <Button type="button" variant={enabled ? 'outline' : 'primary'} size="sm" onClick={() => void toggleEnabled(!enabled)} loading={saving}>
                  {enabled ? 'Désactiver la collecte' : 'Activer la collecte'}
                </Button>
              )}
            </div>
          </div>

          {/* Vérification d'installation (#109) */}
          <div className={`rounded-lg border p-4 ${enabled && !lastReceivedAt ? 'border-warning/30 bg-warning/10' : 'border-border bg-card'}`}>
            <div className="flex items-start gap-3">
              <Signal className={`mt-0.5 h-4 w-4 shrink-0 ${lastReceivedAt ? 'text-success' : enabled ? 'text-warning' : 'text-muted-foreground'}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {lastReceivedAt ? 'Intégration : mesures reçues' : enabled ? 'Intégration : aucune mesure reçue' : 'Intégration : collecte inactive'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lastReceivedAt
                    ? <>Dernière mesure comptabilisée : <span className="font-medium text-foreground">{formatDateTime(lastReceivedAt)}</span>. Cela confirme que le snippet/collecte envoie bien des données.</>
                    : enabled
                      ? 'La collecte est activée mais aucune mesure n’a encore été reçue. Vérifiez que le snippet est intégré, publié et que des visites ont lieu (consentement accordé si requis, DNT/GPC et bloqueurs peuvent empêcher l’envoi).'
                      : 'Activez la collecte et intégrez le snippet pour commencer à recevoir des mesures.'}
                </p>
              </div>
            </div>
          </div>

          {!enabled && !hasPageData && !hasEventData && (
            <EmptyState icon={BarChart3} title="Collecte non activée" description={canManage ? 'Activez la mesure d’audience pour ce projet, puis intégrez les snippets sur votre site. Les statistiques apparaîtront ici après réception de mesures réelles.' : 'La mesure d’audience n’est pas activée pour ce projet. Lorsqu’elle le sera et que des mesures auront été reçues, les statistiques agrégées apparaîtront ici.'} className="py-8" />
          )}

          {hasPageData && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Pages vues</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{stats?.total.toLocaleString('fr-FR')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{stats?.rangeDays} derniers jours</span>
                    {comparison && <Trend value={comparison.changePct} />}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Visiteurs uniques</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{totalVisitors.toLocaleString('fr-FR')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>uniques/jour (somme période)</span>
                    {comparison && <Trend value={comparison.visitorsChangePct ?? 0} />}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Période précédente</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{(comparison?.previousTotal ?? 0).toLocaleString('fr-FR')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{(comparison?.previousVisitors ?? 0).toLocaleString('fr-FR')} visiteurs · {stats?.rangeDays} jours</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Pages distinctes</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{(stats?.paths.length ?? 0).toLocaleString('fr-FR')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Chemins vus sur la période</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground">Jours actifs</p>
                  <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{(stats?.days.length ?? 0).toLocaleString('fr-FR')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">vs {(comparison?.previousActiveDays ?? 0).toLocaleString('fr-FR')} sur la période précédente</p>
                </div>
              </div>

              <Notice tone="info" title="Métriques disponibles et limites">
                Affichés (données réelles, agrégées) : pages vues, <strong>visiteurs uniques par jour</strong> (déduplication privacy-friendly, sans cookie ni identifiant persistant ni IP stockée ; le total sur la période est la <strong>somme des uniques quotidiens</strong>, non dédupliquée entre jours), évolution quotidienne, comparaison avec la période précédente, chemins les plus consultés, sources/référents, appareils, navigateurs, systèmes d’exploitation (si activés) et événements nommés/objectifs. Les visiteurs par dimension sont des uniques/jour sur le segment (somme sur la période). <strong>Non mesurés</strong> : sessions, durée moyenne, taux de rebond, visiteurs uniques multi-jours et propriétés d’événement. <strong>Non collectés</strong> : paramètres UTM/campagnes détaillés et géographie (pays).
              </Notice>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold">Évolution sur la période</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Pages vues et visiteurs uniques agrégés par jour (UTC).</p>
                  {stats && stats.days.length > 0 ? (
                    <ul className="mt-4 space-y-2" aria-label="Pages vues et visiteurs par jour">
                      {stats.days.map((day) => (
                        <li key={day.date} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{formatDay(day.date)}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (day.views / maxDayViews) * 100)}%` }} />
                          </div>
                          <span className="text-right font-mono text-xs tabular-nums whitespace-nowrap">
                            {day.views.toLocaleString('fr-FR')} vues · {(day.visitors ?? 0).toLocaleString('fr-FR')} vis.
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 text-sm text-muted-foreground">Aucune activité sur la période sélectionnée.</p>}
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
                  ) : <p className="mt-4 text-sm text-muted-foreground">Aucun chemin enregistré sur la période.</p>}
                </div>
              </div>
              {hasPageData && (
                <div className="grid gap-6 lg:grid-cols-2">
                  {[
                    { title: 'Sources / référents', items: stats?.referrers ?? [], empty: 'Aucun référent enregistré sur la période.' },
                    { title: 'Appareils', items: stats?.devices ?? [], empty: 'Aucune donnée appareil sur la période.' },
                    { title: 'Navigateurs', items: stats?.browsers ?? [], empty: 'Aucune donnée navigateur sur la période.' },
                    { title: 'Systèmes d’exploitation', items: stats?.operatingSystems ?? [], empty: 'Aucune donnée système sur la période.' },
                  ].map((section) => (
                    <div key={section.title} className="rounded-lg border border-border bg-card p-4">
                      <h3 className="text-sm font-semibold">{section.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Vues et visiteurs uniques/jour sur la période (somme des uniques quotidiens du segment).</p>
                      {section.items.length > 0 ? (
                        <ul className="mt-4 space-y-2" aria-label={section.title}>
                          {section.items.map((row) => (
                            <li key={row.value} className="flex items-start justify-between gap-3 text-sm">
                              <span className="min-w-0 flex-1 break-all font-mono text-xs sm:text-sm">{row.value}</span>
                              <span className="shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                                {row.views.toLocaleString('fr-FR')} vues · {row.visitors.toLocaleString('fr-FR')} vis.
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-4 text-sm text-muted-foreground">{section.empty}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {enabled && !hasPageData && (
            <EmptyState icon={Info} title="Aucune page vue collectée sur la période" description="La mesure est activée, mais aucun événement de page vue n’a encore été reçu pour la période sélectionnée. Vérifiez que le snippet est intégré sur votre site et que des visites ont bien eu lieu (consentement, DNT/GPC, bloqueurs et règles CSP peuvent empêcher l’envoi)." className="py-8" />
          )}

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Événements nommés et objectifs</h3>
                <p className="mt-1 text-sm text-muted-foreground">Comptages agrégés par nom sur la période (sans propriété ni identifiant). Les objectifs de conversion sont des événements nommés marqués comme objectifs ; leur performance correspond à leur nombre d’occurrences mesuré sur la période.</p>
              </div>
            </div>

            {goalEventStats.length > 0 && (
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-medium text-muted-foreground">Performance des objectifs (période)</p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {goalEventStats.map((g) => (
                    <li key={g.name} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 font-mono text-xs"><Flag className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{g.name}</span>
                      <span className="font-mono text-xs font-semibold tabular-nums">{g.count.toLocaleString('fr-FR')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasEventData ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[20rem] text-sm">
                  <caption className="sr-only">Événements nommés agrégés sur la période</caption>
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="px-2 py-2 font-medium">Événement</th><th scope="col" className="px-2 py-2 text-right font-medium">Occurrences</th><th scope="col" className="px-2 py-2 font-medium">Type</th></tr></thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.name} className="border-b border-border last:border-0">
                        <th scope="row" className="px-2 py-2 text-left font-mono text-xs font-medium sm:text-sm">{event.name}</th>
                        <td className="px-2 py-2 text-right font-mono text-xs tabular-nums sm:text-sm">{event.count.toLocaleString('fr-FR')}</td>
                        <td className="px-2 py-2">{event.goal ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground"><Flag className="h-3 w-3" aria-hidden="true" /> Objectif</span> : <span className="text-xs text-muted-foreground">Événement</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Aucun événement nommé reçu sur la période sélectionnée. {canManage ? 'Vous pouvez définir des objectifs et intégrer le snippet d’événement ci-dessous.' : 'Les événements nommés apparaîtront ici lorsqu’ils auront été mesurés.'}</p>
            )}

            {canManage && (
              <div className="mt-5 space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div>
                  <h4 className="text-sm font-medium">Objectifs de conversion</h4>
                  <p className="mt-1 text-xs text-muted-foreground">Noms d’événements considérés comme objectifs (minuscules, chiffres, <code>.</code> <code>_</code> <code>:</code> <code>-</code>, {GOAL_EVENTS_MAX} max). Seul le nom est comptabilisé, sans propriété ni identifiant.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor={`goal-input-${projectId}`} className="mb-1 block text-xs font-medium text-muted-foreground">Ajouter un objectif</label>
                    <input id={`goal-input-${projectId}`} value={goalInput} onChange={(e) => setGoalInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGoal() } }} placeholder="ex. signup, purchase" className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" autoComplete="off" spellCheck={false} />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addGoal} disabled={goalDraft.length >= GOAL_EVENTS_MAX || goalInput.trim() === ''}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Ajouter</Button>
                </div>
                {goalDraft.length > 0 ? (
                  <ul className="flex flex-wrap gap-2" aria-label="Objectifs définis">
                    {goalDraft.map((goal) => (
                      <li key={goal} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs">
                        <span className="font-mono">{goal}</span>
                        <button type="button" onClick={() => removeGoal(goal)} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Retirer l’objectif ${goal}`}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Aucun objectif défini.</p>}
                <div className="flex justify-end"><Button type="button" size="sm" onClick={() => void saveGoals()} loading={savingGoals} disabled={!goalsDirty} disabledReason="Aucune modification à enregistrer">Enregistrer les objectifs</Button></div>
              </div>
            )}
          </div>

          {configured && (snippet || config?.eventSnippet || canManage) && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Intégration</h3>
              <p className="mt-1 text-sm text-muted-foreground">Intégrez les snippets sur votre site. Aucune donnée n’est envoyée tant que la mesure n’est pas activée (et, en mode conditionné, sans consentement). Les bloqueurs de publicité, certaines politiques CSP ou le refus DNT/GPC peuvent empêcher la réception.</p>
              <div className="mt-4 space-y-5">
                <section aria-labelledby={`pageview-snippet-${projectId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 id={`pageview-snippet-${projectId}`} className="text-sm font-medium">Pages vues</h4>
                    {snippet && <CopyButton value={snippet} label="Copier le snippet page vue" />}
                  </div>
                  {snippet ? (
                    <div className="mt-2 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setShowConsentSnippet(false)} className={`min-h-9 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 ${!showConsentSnippet ? 'border-foreground bg-muted font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`} aria-pressed={!showConsentSnippet}>Émission immédiate</button>
                        <button type="button" onClick={() => setShowConsentSnippet(true)} className={`min-h-9 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 ${showConsentSnippet ? 'border-foreground bg-muted font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`} aria-pressed={showConsentSnippet}>Conditionné au consentement</button>
                      </div>
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed"><code>{snippet}</code></pre>
                    </div>
                  ) : <p className="mt-2 text-sm text-muted-foreground">{canManage ? 'Activez la collecte pour générer le snippet de pages vues.' : 'Snippet disponible après configuration par un gestionnaire.'}</p>}
                </section>
                <section aria-labelledby={`event-snippet-${projectId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 id={`event-snippet-${projectId}`} className="text-sm font-medium">Événements nommés</h4>
                    {config?.eventSnippet && <CopyButton value={config.eventSnippet} label="Copier le snippet événement" />}
                  </div>
                  {config?.eventSnippet ? (
                    <div className="mt-2 space-y-2">
                      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed"><code>{config.eventSnippet}</code></pre>
                      <p className="text-xs text-muted-foreground">Appelez <code className="font-mono">window.__eflexTrackEvent(&apos;nom&apos;)</code> après une action. Seul le nom normalisé est comptabilisé, sans propriété ni identifiant (minimisation).</p>
                    </div>
                  ) : <p className="mt-2 text-sm text-muted-foreground">Disponible lorsque la configuration analytique est créée.</p>}
                </section>
                <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>Point de collecte : <span className="font-mono">{config?.collectUrl}</span>. Agrégation côté serveur uniquement (pages vues et noms d’événements). Quota journalier par projet appliqué pour limiter les abus.</span></p>
                <p className="text-xs text-muted-foreground">Référence : <a href="https://github.com/digitaleflex/eflex/blob/main/docs/operations/analytics.md" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">documentation de la mesure d’audience<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (nouvel onglet)</span></a>.</p>
              </div>
            </div>
          )}

          {canManage && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Gestion des données</h3>
              <p className="mt-1 text-sm text-muted-foreground">Exportez ou supprimez les statistiques agrégées conservées pour ce projet (pages vues et événements nommés). Actions scopées, limitées et auditées.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void downloadExport('json')} loading={exporting === 'json'} disabled={exporting !== null}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Exporter en JSON</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void downloadExport('csv')} loading={exporting === 'csv'} disabled={exporting !== null}><Download className="h-3.5 w-3.5" aria-hidden="true" /> Exporter en CSV</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Supprimer les statistiques</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRotate(true)}><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Régénérer la clé</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Régénération : remplacez les snippets intégrés. Suppression : efface les statistiques conservées ; la clé, les objectifs et les réglages restent inchangés.</p>
            </div>
          )}
        </div>
      </SectionCard>

      <ConfirmDialog open={confirmDelete} title="Supprimer les statistiques ?" description="Toutes les statistiques agrégées conservées pour ce projet (pages vues et événements nommés) seront supprimées définitivement. La configuration analytique sera conservée." confirmLabel="Supprimer les statistiques" destructive onConfirm={deleteStats} onCancel={() => { if (!deleting) setConfirmDelete(false) }} />
      <ConfirmDialog open={confirmRotate} title="Régénérer la clé de mesure ?" description="Une nouvelle clé publique sera générée. Les intégrations existantes devront être mises à jour avec la nouvelle clé." confirmLabel="Régénérer la clé" onConfirm={rotateKey} onCancel={() => { if (!rotating) setConfirmRotate(false) }} />
    </div>
  )
}
