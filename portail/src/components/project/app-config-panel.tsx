'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Config = {
  healthCheckEnabled: boolean
  healthCheckPath: string
  healthCheckMethod: string
  healthCheckPort: string
  healthCheckHost: string
  healthCheckScheme: string
  healthCheckReturnCode: number
  healthCheckResponseText: string
  healthCheckInterval: number
  healthCheckTimeout: number
  healthCheckRetries: number
  healthCheckStartPeriod: number
  watchPaths: string
  limitsCpus: string
  limitsMemory: string
  limitsMemorySwap: string
  limitsMemoryReservation: string
}

export function AppConfigPanel({
  projectId,
  canManage,
  apps,
}: {
  projectId: string
  canManage: boolean
  apps: Array<{ id: string; name: string; deployed: boolean }>
}) {
  const [appId, setAppId] = useState(apps[0]?.id ?? '')
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const selected = apps.find((a) => a.id === appId) ?? apps[0]

  const load = async (target = appId) => {
    if (!target) { setLoading(false); return }
    setLoading(true); setError(null); setMessage(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/app-config?appId=${encodeURIComponent(target)}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { config?: Config | null; error?: string; unavailable?: string }
      if (!res.ok) {
        setError(data.error ?? 'Configuration indisponible.')
        setConfig(null)
      } else {
        setConfig(data.config ?? null)
        if (data.unavailable) setError(data.unavailable)
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (!appId && apps[0]) setAppId(apps[0].id) }, [appId, apps])
  useEffect(() => { void load(appId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [appId, projectId])

  const save = async () => {
    if (!config) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/app-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, config }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setError(data.error ?? 'Enregistrement impossible.')
      else setMessage('Configuration enregistrée. Les changements de santé s’appliquent au prochain déploiement/bascule selon l’hébergement.')
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setSaving(false)
    }
  }

  if (apps.length === 0) return <p className="text-sm text-muted-foreground">Aucune application configurée.</p>

  return (
    <div className="space-y-4">
      {apps.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="cfg-app">Application</label>
          <select id="cfg-app" className="h-9 rounded-lg border border-input bg-background px-3 text-sm" value={appId} onChange={(e) => setAppId(e.target.value)}>
            {apps.map((app) => <option key={app.id} value={app.id}>{app.name}{app.deployed ? '' : ' (non déployée)'}</option>)}
          </select>
        </div>
      )}

      {loading ? <p className="text-sm text-muted-foreground">Chargement de la configuration…</p> : !selected?.deployed ? (
        <p className="text-sm text-muted-foreground">Application non déployée : la configuration sera disponible après le premier déploiement.</p>
      ) : !config ? (
        <p className="text-sm text-muted-foreground">{error ?? 'Configuration indisponible.'}</p>
      ) : (
        <>
          {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-foreground">{message}</p>}

          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Contrôle de santé (healthcheck)</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.healthCheckEnabled} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckEnabled: e.target.checked })} />
              Activer le contrôle de santé
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Chemin</span><Input value={config.healthCheckPath} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckPath: e.target.value })} placeholder="/" /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Méthode</span><Input value={config.healthCheckMethod} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckMethod: e.target.value })} placeholder="GET" /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Schéma</span>
                <select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={config.healthCheckScheme} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckScheme: e.target.value })}>
                  <option value="http">http</option><option value="https">https</option>
                </select>
              </label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Code retour attendu</span><Input type="number" value={config.healthCheckReturnCode} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckReturnCode: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Intervalle (s)</span><Input type="number" value={config.healthCheckInterval} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckInterval: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Timeout (s)</span><Input type="number" value={config.healthCheckTimeout} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckTimeout: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Tentatives</span><Input type="number" value={config.healthCheckRetries} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckRetries: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Délai de démarrage (s)</span><Input type="number" value={config.healthCheckStartPeriod} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckStartPeriod: Number(e.target.value) })} /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Port (optionnel)</span><Input value={config.healthCheckPort} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckPort: e.target.value })} placeholder="auto" /></label>
              <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Hôte (optionnel)</span><Input value={config.healthCheckHost} disabled={!canManage} onChange={(e) => setConfig({ ...config, healthCheckHost: e.target.value })} placeholder="vide = conteneur" /></label>
            </div>
            <p className="text-xs text-muted-foreground">Si activé, l’hébergement peut attendre une réponse saine avant de basculer le trafic sur la nouvelle version (selon la plateforme).</p>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Chemins surveillés (watch paths)</p>
            <p className="text-xs text-muted-foreground">Limite les redéploiements automatiques aux changements touchant ces chemins (séparés par des virgules ou retours à la ligne, selon support Coolify). Laisser vide pour le comportement par défaut.</p>
            <textarea
              className="min-h-[88px] w-full rounded-lg border border-input bg-background p-3 font-mono text-xs"
              value={config.watchPaths}
              disabled={!canManage}
              onChange={(e) => setConfig({ ...config, watchPaths: e.target.value })}
              placeholder={"apps/web/**\npackages/**"}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Limites de ressources (conteneur)</p>
            <p className="text-xs text-muted-foreground">Valeurs transmises à l’hébergement (Coolify/Docker), par ex. CPU <span className="font-mono">0.5</span> ou <span className="font-mono">2</span>, mémoire <span className="font-mono">512M</span> ou <span className="font-mono">1G</span>. Laisser vide pour ne pas imposer de limite. L’application effective dépend des capacités du serveur et des politiques de plan.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">CPU (limites)</span><Input value={config.limitsCpus} disabled={!canManage} onChange={(e) => setConfig({ ...config, limitsCpus: e.target.value })} placeholder="ex. 1" className="font-mono" /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Mémoire</span><Input value={config.limitsMemory} disabled={!canManage} onChange={(e) => setConfig({ ...config, limitsMemory: e.target.value })} placeholder="ex. 512M" className="font-mono" /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Swap mémoire</span><Input value={config.limitsMemorySwap} disabled={!canManage} onChange={(e) => setConfig({ ...config, limitsMemorySwap: e.target.value })} placeholder="ex. 1G" className="font-mono" /></label>
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Réservation mémoire</span><Input value={config.limitsMemoryReservation} disabled={!canManage} onChange={(e) => setConfig({ ...config, limitsMemoryReservation: e.target.value })} placeholder="ex. 256M" className="font-mono" /></label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button type="button" onClick={() => void save()} loading={saving}>
                <Save className="h-4 w-4" aria-hidden="true" /> Enregistrer la configuration
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => void load(appId)} disabled={loading}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Recharger
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
