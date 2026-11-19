'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'

type CoolifyDeployment = { id: string; status: string; commit: string | null; createdAt: string | null; serverName?: string | null }
type AppHistory = { id: string; name: string; deployments: CoolifyDeployment[]; error?: string }

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function CoolifyDeploymentsPanel({ projectId, multiApp }: { projectId: string; multiApp: boolean }) {
  const [apps, setApps] = useState<AppHistory[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/coolify-deployments`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { apps?: AppHistory[]; error?: string }
      if (!res.ok) { setError(data.error ?? 'Historique hébergement indisponible.'); setApps(null) }
      else setApps(Array.isArray(data.apps) ? data.apps : [])
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open && !apps && !loading) void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open])

  if (!open) {
    return (
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Server className="h-4 w-4" aria-hidden="true" /> Voir l’historique hébergement (Coolify)
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">Affiche les déploiements connus par l’hébergement pour cette application (utile en cas d’écart ou de déploiement lancé hors portail).</p>
      </div>
    )
  }

  return (
    <div className="border-b border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Server className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Historique hébergement (Coolify)</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="h-7 px-2 text-xs"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Actualiser</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-7 px-2 text-xs">Masquer</Button>
        </div>
      </div>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Chargement…</p>}
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
      {!loading && apps && (
        <div className="mt-2 space-y-3">
          {apps.length === 0 && <p className="text-xs text-muted-foreground">Aucune application déployée sur l’hébergement.</p>}
          {apps.map((app) => (
            <div key={app.id}>
              {multiApp && <p className="text-xs font-medium text-foreground">{app.name}</p>}
              {app.error ? <p className="text-xs text-warning">Indisponible : {app.error}</p> : app.deployments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun déploiement signalé par l’hébergement.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {app.deployments.slice(0, 10).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
                      <span className="font-mono text-[11px] text-muted-foreground" title={d.id}>{d.id.slice(0, 8)}</span>
                      <span className="font-medium text-foreground">{d.status}</span>
                      {d.commit && <span className="font-mono text-muted-foreground">{d.commit}</span>}
                      <span className="text-muted-foreground">{dt(d.createdAt)}</span>
                      {d.serverName && <span className="text-muted-foreground">{d.serverName}</span>}
                    </li>
                  ))}
                  {app.deployments.length > 10 && <li className="text-xs text-muted-foreground">+{app.deployments.length - 10} autres</li>}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
