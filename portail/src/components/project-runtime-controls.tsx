'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, RefreshCw, RotateCw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

type Action = 'start' | 'stop' | 'restart'

interface Runtime {
  deployed: boolean
  app: { status: string; healthCheckEnabled: boolean; healthCheckPath: string | null } | null
  tls: { valid: boolean | null; expiresAt: string | null; checkedAt: string | null }
  error?: string
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

function statusView(status: string | undefined): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  if (!status) return { label: 'Inconnu', tone: 'muted' }
  if (status.startsWith('restarting')) return { label: 'Redémarrage…', tone: 'warning' }
  if (status.startsWith('starting')) return { label: 'Démarrage…', tone: 'warning' }
  if (status.startsWith('running')) {
    return status.includes('unhealthy')
      ? { label: 'En ligne — healthcheck en échec', tone: 'warning' }
      : { label: 'En ligne', tone: 'success' }
  }
  if (status.startsWith('exited') || status.startsWith('stopped')) return { label: 'Arrêtée', tone: 'muted' }
  return { label: status, tone: 'muted' }
}

const TONE: Record<'success' | 'warning' | 'danger' | 'muted', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/50',
}

/** Statut du conteneur et actions Coolify (démarrer / arrêter / redémarrer). */
export function ProjectRuntimeControls({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<Action | null>(null)
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/runtime`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error ?? 'Statut indisponible.' })
        return
      }
      setRuntime(data as Runtime)
      setFeedback(null)
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: Action) {
    setWorking(action)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/runtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error ?? 'Action impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: action === 'stop' ? 'Application arrêtée.' : action === 'restart' ? 'Redémarrage lancé.' : 'Application démarrée.' })
      setConfirm(null)
      await load()
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Vérification du statut…</p>
  }

  if (!runtime?.deployed) {
    return (
      <p className="text-sm text-muted-foreground">
        Les actions seront disponibles après le premier déploiement du projet.
      </p>
    )
  }

  const view = statusView(runtime.app?.status)
  const stopped = runtime.app?.status?.startsWith('exited') || runtime.app?.status?.startsWith('stopped')
  const healthcheck = runtime.app?.healthCheckEnabled ? runtime.app.healthCheckPath ?? '/ (par défaut)' : null

  return (
    <div className="space-y-4">
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={
            feedback.tone === 'error'
              ? 'rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground'
          }
        >
          {feedback.message}
        </p>
      )}

      {runtime.error && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          Statut de l’hébergement indisponible : {runtime.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', TONE[view.tone])} />
          <span className="font-medium">{view.label}</span>
          {healthcheck && <span className="text-xs text-muted-foreground">healthcheck : {healthcheck}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {stopped ? (
            <Button type="button" size="sm" loading={working === 'start'} onClick={() => void run('start')} disabled={!runtime.app}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Démarrer
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" loading={working === 'restart'} onClick={() => setConfirm('restart')} disabled={!runtime.app}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Redémarrer
              </Button>
              <Button type="button" variant="destructive" size="sm" loading={working === 'stop'} onClick={() => setConfirm('stop')} disabled={!runtime.app}>
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Arrêter
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} loading={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Actualiser
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'restart'}
        title="Redémarrer l’application ?"
        description="Le conteneur sera recréé et l’application sera brièvement indisponible."
        confirmLabel="Redémarrer"
        onConfirm={() => run('restart')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'stop'}
        title="Arrêter l’application ?"
        description="Le site ne répondra plus jusqu’au prochain démarrage ou déploiement."
        confirmLabel="Arrêter l’application"
        destructive
        onConfirm={() => run('stop')}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
