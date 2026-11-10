'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Database, Play, Plus, RefreshCw, RotateCw, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

interface ManagedDatabase {
  id: string
  kind: string
  label: string
  envKey: string
  description: string | null
  status: string
  error: string | null
  createdAt: string
}

interface AvailableDatabase {
  kind: string
  label: string
  envKey: string
  description: string
}

interface DatabasesResponse {
  databases: ManagedDatabase[]
  canManage: boolean
  available: AvailableDatabase[]
}

type Feedback = { tone: 'success' | 'error'; message: string } | null
type Action = 'start' | 'stop' | 'restart'
type ConfirmKind = Action | 'delete'

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  running: { label: 'En ligne', tone: 'success' },
  creating: { label: 'Création…', tone: 'warning' },
  restarting: { label: 'Redémarrage…', tone: 'warning' },
  starting: { label: 'Démarrage…', tone: 'warning' },
  exited: { label: 'Arrêtée', tone: 'muted' },
  stopped: { label: 'Arrêtée', tone: 'muted' },
  unknown: { label: 'Inconnu', tone: 'muted' },
}

function statusView(status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  const base = status.split(':')[0] ?? status
  if (base === 'running') {
    return status.includes('unhealthy')
      ? { label: 'Healthcheck en échec', tone: 'warning' }
      : { label: 'En ligne', tone: 'success' }
  }
  return STATUS[base] ?? { label: status, tone: 'muted' }
}

const TONE: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/50',
}

/** Bases managées du projet : PostgreSQL et Redis privés, injectés par variables. */
export function ProjectDatabases({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DatabasesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; database: ManagedDatabase } | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [lastDeployment, setLastDeployment] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/databases`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Bases indisponibles.' })
        return
      }
      setData(body as DatabasesResponse)
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function create(kind: string) {
    setCreating(kind)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/databases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Création impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: body.message ?? 'Base créée.' })
      if (body.deploymentId) setLastDeployment(body.deploymentId)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setCreating(null)
    }
  }

  async function act(database: ManagedDatabase, action: Action) {
    setWorking(database.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/databases/${database.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Action impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: action === 'stop' ? 'Base arrêtée.' : action === 'restart' ? 'Redémarrage lancé.' : 'Base démarrée.' })
      setConfirm(null)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  async function remove(database: ManagedDatabase) {
    setWorking(database.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/databases/${database.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Suppression impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: body.message ?? 'Base supprimée.' })
      if (body.deploymentId) setLastDeployment(body.deploymentId)
      setConfirm(null)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement des bases…</p>
  if (!data) return null

  const canManage = data.canManage

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
          {lastDeployment && (
            <>
              {' '}
              <Link href={`/dashboard/projects/${projectId}?tab=deployments`} className="font-medium text-primary hover:underline">
                Voir le déploiement
              </Link>
            </>
          )}
        </p>
      )}

      {data.databases.length > 0 && (
        <ul className="space-y-2">
          {data.databases.map((database) => {
            const view = statusView(database.status)
            const stopped = database.status.startsWith('exited') || database.status.startsWith('stopped')
            return (
              <li key={database.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {database.label}
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{database.envKey}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', TONE[view.tone])} />
                      {view.label}
                      <span>· créée le {new Date(database.createdAt).toLocaleDateString('fr-FR')}</span>
                    </p>
                    {database.error && <p className="mt-1 text-xs text-warning">Statut indisponible : {database.error}</p>}
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {stopped ? (
                        <Button type="button" size="sm" loading={working === database.id} onClick={() => void act(database, 'start')}>
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                          Démarrer
                        </Button>
                      ) : (
                        <>
                          <Button type="button" variant="outline" size="sm" loading={working === database.id} onClick={() => setConfirm({ kind: 'restart', database })}>
                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Redémarrer
                          </Button>
                          <Button type="button" variant="destructive" size="sm" loading={working === database.id} onClick={() => setConfirm({ kind: 'stop', database })}>
                            <Square className="h-3.5 w-3.5" aria-hidden="true" />
                            Arrêter
                          </Button>
                        </>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        Actualiser
                      </Button>
                      <Button type="button" variant="ghost" size="sm" loading={working === database.id} onClick={() => setConfirm({ kind: 'delete', database })}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Supprimer
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {canManage && data.available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.available.map((item) => (
            <Button
              key={item.kind}
              type="button"
              variant="outline"
              loading={creating === item.kind}
              onClick={() => void create(item.kind)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Créer {item.label}
            </Button>
          ))}
        </div>
      )}

      {data.databases.length === 0 && !canManage && (
        <p className="text-sm text-muted-foreground">Aucune base managée. Un administrateur peut en créer une.</p>
      )}

      <p className="text-xs text-muted-foreground">
        La base est privée, accessible uniquement depuis le réseau Docker de l’application. Son URL est
        chiffrée et injectée comme variable d’environnement au prochain déploiement.
      </p>

      <ConfirmDialog
        open={confirm?.kind === 'restart'}
        title={`Redémarrer ${confirm?.database.label ?? 'la base'} ?`}
        description="La base sera brièvement indisponible pour l’application."
        confirmLabel="Redémarrer"
        onConfirm={() => (confirm ? act(confirm.database, 'restart') : undefined)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'stop'}
        title={`Arrêter ${confirm?.database.label ?? 'la base'} ?`}
        description="L’application perdra l’accès à sa base jusqu’au redémarrage."
        confirmLabel="Arrêter la base"
        destructive
        onConfirm={() => (confirm ? act(confirm.database, 'stop') : undefined)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title={`Supprimer ${confirm?.database.label ?? 'la base'} ?`}
        description="La base et ses données seront définitivement supprimées. La variable d’environnement associée sera retirée au prochain déploiement."
        confirmLabel="Supprimer la base"
        destructive
        onConfirm={() => (confirm ? remove(confirm.database) : undefined)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
