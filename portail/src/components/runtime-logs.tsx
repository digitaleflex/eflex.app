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

  const activeApp = useMemo(
    () => (apps.length > 1 ? apps.find((app) => app.id === selectedAppId) ?? apps[0] ?? null : null),
    [apps, selectedAppId],
  )
  const activeServices = useMemo(
    () => (apps.length > 1 ? activeApp?.services ?? [] : services),
    [apps, services, activeApp],
  )

  // Réinitialise le service quand l'application change (la liste peut différer).
  const onAppChange = (appId: string) => {
    setSelectedAppId(appId)
    setService('')
  }

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (service !== '') params.set('service', service)
    if (apps.length > 1 && selectedAppId) params.set('appId', selectedAppId)
    return params.toString()
  }, [service, apps.length, selectedAppId])

  const streamUrl = `/api/projects/${projectId}/logs/stream${query ? `?${query}` : ''}`
  const downloadUrl = `/api/projects/${projectId}/logs?${new URLSearchParams({
    ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}),
    format: 'text',
    lines: '2000',
  }).toString()}`

  const label = useMemo(() => {
    if (apps.length > 1) {
      const name = activeApp?.name ?? 'application'
      return service ? `Journaux · ${name} · ${service}` : `Journaux · ${name}`
    }
    return service ? `Journaux · ${service}` : 'Journaux d’exécution'
  }, [apps.length, activeApp, service])

  return (
    <section aria-labelledby="runtime-logs-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="runtime-logs-title" className="flex items-center gap-2 font-semibold">
            <TerminalSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            Journaux d’exécution
          </h2>
          <p className="text-sm text-muted-foreground">
            Flux en direct du conteneur (fenêtre récente), secrets connus masqués. Le
            bouton « Fenêtre » télécharge les lignes récentes masquées côté serveur.
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
                aria-label="Application dont afficher les journaux"
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
                aria-label="Service compose"
              >
                <option value="">Tous les services</option>
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

      <Terminal
        url={streamUrl}
        label={label}
        downloadUrl={downloadUrl}
        hint="Les motifs ressemblant à des secrets sont signalés prudemment ; les valeurs connues sont masquées. L’historique complet n’est pas conservé."
      />
    </section>
  )
}

