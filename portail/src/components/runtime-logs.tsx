'use client'

import { useMemo, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import { Terminal } from '@/components/terminal'

export type RuntimeLogApp = {
  id: string
  name: string
  /** Services compose déclarés par le plan de l'application. */
  services?: readonly string[]
}

/**
 * Journaux d'exécution du conteneur en direct (flux SSE, sondage Coolify côté serveur).
 * Sélection de l'application (multi-app) et du service compose, secrets connus masqués.
 * Recherche, suivi/pause et téléchargement sont fournis par le terminal.
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
  const [service, setService] = useState('')

  const activeServices = useMemo(() => {
    if (apps.length > 1) {
      const current = apps.find((app) => app.id === selectedAppId) ?? apps[0]
      return current?.services ?? []
    }
    return services
  }, [apps, selectedAppId, services])

  // Réinitialise le service quand l'application change (la liste peut différer).
  const onAppChange = (appId: string) => {
    setSelectedAppId(appId)
    setService('')
  }

  const streamUrl = useMemo(() => {
    const query = new URLSearchParams()
    if (service !== '') query.set('service', service)
    if (apps.length > 1 && selectedAppId) query.set('appId', selectedAppId)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return `/api/projects/${projectId}/logs/stream${suffix}`
  }, [projectId, service, apps.length, selectedAppId])

  const label = useMemo(() => {
    if (apps.length > 1) {
      const name = (apps.find((app) => app.id === selectedAppId) ?? apps[0])?.name ?? 'application'
      return service ? `Journaux · ${name} · ${service}` : `Journaux · ${name}`
    }
    return service ? `Journaux · ${service}` : 'Journaux d’exécution'
  }, [apps, selectedAppId, service])

  return (
    <section aria-labelledby="runtime-logs-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="runtime-logs-title" className="flex items-center gap-2 font-semibold">
            <TerminalSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            Journaux d’exécution
          </h2>
          <p className="text-sm text-muted-foreground">
            Flux en direct du conteneur, secrets connus masqués. La fenêtre récente est
            affichée ; utilisez Télécharger pour conserver ce qui est visible.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {apps.length > 1 && (
            <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
              <span className="text-muted-foreground">Application</span>
              <select
                value={selectedAppId}
                onChange={(e) => onAppChange(e.target.value)}
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
        </div>
      </div>

      <Terminal url={streamUrl} label={label} />
    </section>
  )
}

