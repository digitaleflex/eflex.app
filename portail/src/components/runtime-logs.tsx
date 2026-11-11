'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type RuntimeLogApp = {
  id: string
  name: string
  /** Services compose déclarés par le plan de l'application. */
  services?: readonly string[]
}

/**
 * Journaux d'exécution du conteneur (Coolify), rafraîchis automatiquement.
 * Pour un compose, un sélecteur permet de lire les logs d'un service précis.
 * En multi-app, un sélecteur d'application cible l'instance à consulter.
 * Les valeurs des variables d'environnement connues sont masquées côté serveur.
 */
export function RuntimeLogs({
  projectId,
  services = [],
  apps = [],
}: {
  projectId: string
  /** Services compose ; vide pour une application mono-service. */
  services?: readonly string[]
  /** Applications du projet (multi-app) ; vide ou 1 élément = pas de sélecteur. */
  apps?: readonly RuntimeLogApp[]
}) {
  const [selectedAppId, setSelectedAppId] = useState<string>(apps[0]?.id ?? '')
  const [logs, setLogs] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [copied, setCopied] = useState(false)
  const [service, setService] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeServices = useMemo(() => {
    if (apps.length > 1) {
      const current = apps.find((app) => app.id === selectedAppId) ?? apps[0]
      return current?.services ?? []
    }
    return services
  }, [apps, selectedAppId, services])

  useEffect(() => {
    setService('')
  }, [selectedAppId])

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ lines: '200' })
      if (service !== '') query.set('service', service)
      if (apps.length > 1 && selectedAppId) query.set('appId', selectedAppId)
      const response = await fetch(`/api/projects/${projectId}/logs?${query.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? 'Journaux indisponibles.')
        return
      }
      setLogs(typeof data.logs === 'string' ? data.logs : '')
      setUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null)
      setError('')
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }, [projectId, service, apps.length, selectedAppId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
      return
    }
    timer.current = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 5_000)
    return () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [autoRefresh, load])

  async function copy() {
    try {
      await navigator.clipboard.writeText(logs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      setError('Copie impossible dans ce navigateur.')
    }
  }

  return (
    <section aria-labelledby="runtime-logs-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="runtime-logs-title" className="flex items-center gap-2 font-semibold">
            <TerminalSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            Journaux d’exécution
          </h2>
          <p className="text-sm text-muted-foreground">
            Dernières lignes du conteneur, secrets connus masqués.
            {updatedAt && <span className="ml-1 tabular-nums">Mis à jour à {new Date(updatedAt).toLocaleTimeString('fr-FR')}.</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {apps.length > 1 && (
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
              <span className="text-muted-foreground">Application</span>
              <select
                value={selectedAppId}
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
          {activeServices.length > 0 && (
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
              <span className="text-muted-foreground">Service</span>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="min-h-7 bg-transparent font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">tous</option>
                {activeServices.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-primary"
            />
            Rafraîchir automatiquement
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Actualiser
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} disabled={logs === ''}>
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <pre
        aria-label="Journaux d’exécution du conteneur"
        className={cn(
          'max-h-[32rem] min-h-48 overflow-auto rounded-xl border border-border bg-eflexnavy p-4 font-mono text-xs leading-relaxed text-white/90',
          loading && logs === '' && 'flex items-center justify-center',
        )}
      >
        {loading && logs === '' ? 'Chargement des journaux…' : logs || 'Aucun journal pour le moment.'}
      </pre>
    </section>
  )
}
