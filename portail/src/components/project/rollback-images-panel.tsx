'use client'

import { useEffect, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RollbackImage = { commit: string; image?: string | null; createdAt?: string | null }
type AppImages = { id: string; name: string; images: RollbackImage[]; error?: string }

const short = (commit: string) => (commit.length > 12 ? commit.slice(0, 7) : commit)

export function RollbackImagesPanel({ projectId, multiApp }: { projectId: string; multiApp: boolean }) {
  const [apps, setApps] = useState<AppImages[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/rollback-images`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { apps?: AppImages[]; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Impossible de charger les versions disponibles.')
        setApps(null)
      } else {
        setApps(Array.isArray(data.apps) ? data.apps : [])
      }
    } catch {
      setError('Impossible de contacter le serveur.')
      setApps(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (loading) {
    return <p className="px-4 py-3 text-xs text-muted-foreground sm:px-5">Chargement des versions disponibles pour retour arrière…</p>
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-destructive sm:px-5" role="alert">
        {error}
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
        </Button>
      </div>
    )
  }
  if (!apps || apps.length === 0) return null

  const total = apps.reduce((sum, app) => sum + app.images.length, 0)

  return (
    <div className="border-b border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Versions disponibles pour retour arrière (côté hébergement)
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()} className="h-7 px-2 text-xs">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Actualiser
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Seuls les commits ayant une image/version conservée par l’hébergement peuvent être restaurés. La liste ci-dessous reflète ce que Coolify expose.
      </p>
      <div className={cn('mt-2 space-y-2', multiApp ? '' : '')}>
        {apps.map((app) => (
          <div key={app.id}>
            {multiApp && <p className="text-xs font-medium text-foreground">{app.name}</p>}
            {app.error ? (
              <p className="text-xs text-warning">Indisponible : {app.error}</p>
            ) : app.images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucune image de retour arrière signalée.</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {app.images.slice(0, 12).map((image, index) => (
                  <li key={`${image.commit}-${index}`}>
                    <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs tabular-nums text-foreground" title={image.commit}>
                      {short(image.commit)}
                    </span>
                  </li>
                ))}
                {app.images.length > 12 && (
                  <li className="text-xs text-muted-foreground">+{app.images.length - 12} autres</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Si aucune image n’apparaît, l’hébergement n’a peut-être pas conservé d’image de retour ou ne l’expose pas pour cette application.</p>
      )}
    </div>
  )
}
