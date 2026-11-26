'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Task = { id: string; name: string; command: string; frequency: string; enabled: boolean; containerName?: string | null }
type Execution = { id: string; status: string; createdAt: string | null; finishedAt: string | null; message?: string | null }

const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function ScheduledTasksPanel({
  projectId,
  canManage,
  apps,
}: {
  projectId: string
  canManage: boolean
  apps: Array<{ id: string; name: string; deployed: boolean }>
}) {
  const deployedApps = useMemo(() => apps.filter((app) => app.deployed), [apps])
  const [appId, setAppId] = useState<string>(deployedApps[0]?.id ?? apps[0]?.id ?? '')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', command: '', frequency: '*/15 * * * *' })
  const [executions, setExecutions] = useState<Record<string, Execution[]>>({})

  const selected = apps.find((app) => app.id === appId) ?? apps[0]
  const canUse = Boolean(selected?.deployed)

  const load = async (targetAppId = appId) => {
    if (!targetAppId) { setTasks([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduled-tasks?appId=${encodeURIComponent(targetAppId)}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { tasks?: Task[]; error?: string; unavailable?: string }
      if (!res.ok) {
        setError(data.error ?? 'Impossible de charger les tâches planifiées.')
        setTasks([])
      } else {
        setTasks(Array.isArray(data.tasks) ? data.tasks : [])
        if (data.unavailable && !data.error) setError(data.unavailable)
      }
    } catch {
      setError('Impossible de contacter le serveur.')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!appId && apps[0]) setAppId(apps[0].id)
  }, [appId, apps])

  useEffect(() => {
    void load(appId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, projectId])

  const create = async () => {
    if (!form.name.trim() || !form.command.trim() || !form.frequency.trim()) return
    setBusy('create')
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduled-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, name: form.name, command: form.command, frequency: form.frequency, enabled: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setError(data.error ?? 'Création impossible.')
      else {
        setForm({ name: '', command: '', frequency: '*/15 * * * *' })
        await load(appId)
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(null)
    }
  }

  const run = async (taskId: string) => {
    setBusy(taskId)
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduled-tasks/${taskId}/execute?appId=${encodeURIComponent(appId)}`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setError(data.error ?? 'Exécution impossible.')
      else await load(appId)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (taskId: string) => {
    setBusy(taskId)
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduled-tasks/${taskId}?appId=${encodeURIComponent(appId)}`, { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setError(data.error ?? 'Suppression impossible.')
      else await load(appId)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(null)
    }
  }

  const loadExecutions = async (taskId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduled-tasks/${taskId}/executions?appId=${encodeURIComponent(appId)}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { executions?: Execution[] }
      if (res.ok && Array.isArray(data.executions)) {
        setExecutions((prev) => ({ ...prev, [taskId]: data.executions as Execution[] }))
      } else if (!res.ok) {
        setError('Impossible de charger l’historique des exécutions.')
      }
    } catch {
      setError('Impossible de charger l’historique des exécutions.')
    }
  }

  if (apps.length === 0) {
    return <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">Aucune application configurée pour ce projet.</p>
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      {apps.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="tasks-app">Application</label>
          <select
            id="tasks-app"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          >
            {apps.map((app) => (
              <option key={app.id} value={app.id}>{app.name}{app.deployed ? '' : ' (non déployée)'}</option>
            ))}
          </select>
        </div>
      )}

      {!canUse ? (
        <p className="text-sm text-muted-foreground">Cette application n’est pas encore déployée sur l’hébergement : les tâches planifiées seront disponibles après le premier déploiement.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Les tâches sont exécutées dans le conteneur de l’application selon la planification (cron) définie.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load(appId)} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" /> Actualiser
            </Button>
          </div>

          {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          {canManage && (
            <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Nom</span>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex. Nettoyage cache" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Commande</span>
                <Input value={form.command} onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))} placeholder="Ex. php artisan schedule:run" className="font-mono text-xs" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Cron</span>
                <Input value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} placeholder="*/15 * * * *" className="font-mono text-xs" />
              </label>
              <Button type="button" onClick={() => void create()} loading={busy === 'create'} disabled={!form.name.trim() || !form.command.trim() || !form.frequency.trim()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter
              </Button>
              <p className="text-xs text-muted-foreground sm:col-span-4">Expression cron standard (minute heure jour mois jour-semaine). La commande est exécutée côté hébergement ; vérifiez qu’elle est sûre pour votre application.</p>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement des tâches…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune tâche planifiée configurée.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {task.name}
                        <span className={cn('rounded-full px-2 py-0.5 text-xs', task.enabled ? 'bg-success/15 text-success-foreground' : 'bg-muted text-muted-foreground')}>
                          {task.enabled ? 'active' : 'désactivée'}
                        </span>
                      </p>
                      <p className="mt-1 font-mono text-xs text-foreground break-all">{task.command}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Planification : <span className="font-mono">{task.frequency || '—'}</span></p>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" loading={busy === task.id} onClick={() => void run(task.id)}>
                          <Play className="h-4 w-4" aria-hidden="true" /> Exécuter
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void loadExecutions(task.id)}>
                          Historique
                        </Button>
                        <Button type="button" variant="ghost" size="sm" loading={busy === task.id} onClick={() => void remove(task.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                        </Button>
                      </div>
                    )}
                  </div>
                  {executions[task.id] && (
                    <div className="mt-3 border-t border-border pt-2">
                      <p className="text-xs font-medium text-muted-foreground">Dernières exécutions</p>
                      {executions[task.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">Aucune exécution connue.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs">
                          {executions[task.id].slice(0, 5).map((ex) => (
                            <li key={ex.id} className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                              <span className="font-medium">{ex.status}</span>
                              <span className="text-muted-foreground">début {dateTime(ex.createdAt)}</span>
                              <span className="text-muted-foreground">fin {dateTime(ex.finishedAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
