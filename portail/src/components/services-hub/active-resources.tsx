'use client'

import { Play, RefreshCw, RotateCw, Square, Trash2 } from 'lucide-react'
import { ServiceIcon } from '@/components/service-icon'
import { Button } from '@/components/ui/button'
import { DatabaseBackups } from '@/components/database-backups'
import { cn } from '@/lib/utils'
import type { ManagedDatabaseView } from '@/lib/services-hub'

export type ResourceAction = 'start' | 'stop' | 'restart'

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

export function ActiveResources({
  projectId,
  databases,
  canManage,
  workingId,
  onRefresh,
  onRequestAction,
  onRequestDelete,
}: {
  projectId: string
  databases: ManagedDatabaseView[]
  canManage: boolean
  workingId: string | null
  onRefresh: () => void
  onRequestAction: (database: ManagedDatabaseView, action: ResourceAction) => void
  onRequestDelete: (database: ManagedDatabaseView) => void
}) {
  if (databases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {canManage
          ? 'Aucune ressource active. Ajoutez un service depuis le catalogue ci-dessous.'
          : 'Aucune ressource active. Un administrateur peut en ajouter.'}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {databases.map((database) => {
        const view = statusView(database.status)
        const stopped = database.status.startsWith('exited') || database.status.startsWith('stopped')
        return (
          <li key={database.id} id={`resource-${database.kind}`} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <ServiceIcon kind={database.kind} label={database.label} className="h-7 w-7" />
                  {database.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {database.envKey}
                  </span>
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
                    <Button type="button" size="sm" loading={workingId === database.id} onClick={() => onRequestAction(database, 'start')}>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Démarrer
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" size="sm" loading={workingId === database.id} onClick={() => onRequestAction(database, 'restart')}>
                        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                        Redémarrer
                      </Button>
                      <Button type="button" variant="destructive" size="sm" loading={workingId === database.id} onClick={() => onRequestAction(database, 'stop')}>
                        <Square className="h-3.5 w-3.5" aria-hidden="true" />
                        Arrêter
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={onRefresh} aria-label="Actualiser les ressources">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Actualiser
                  </Button>
                  <Button type="button" variant="ghost" size="sm" loading={workingId === database.id} onClick={() => onRequestDelete(database)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Supprimer
                  </Button>
                </div>
              )}
            </div>
            {database.kind === 'postgresql' && <DatabaseBackups projectId={projectId} databaseId={database.id} />}
          </li>
        )
      })}
    </ul>
  )
}
