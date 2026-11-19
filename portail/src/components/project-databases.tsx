'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { InstanceCapabilitiesPanel } from '@/components/services-hub/instance-capabilities-panel'
import { ActiveResources, type ResourceAction } from '@/components/services-hub/active-resources'
import { ServicesBrowser } from '@/components/services-hub/services-browser'
import { ServiceDetailDialog } from '@/components/services-hub/service-detail-dialog'
import {
  buildServicesHubModel,
  type EngineInfoView,
  type ManagedDatabaseView,
  type RuntimeView,
  type UnifiedService,
} from '@/lib/services-hub'

interface DatabasesResponse {
  databases: ManagedDatabaseView[]
  canManage: boolean
  available?: EngineInfoView[]
  engines?: EngineInfoView[]
  runtime?: RuntimeView
}

type Feedback = { tone: 'success' | 'error'; message: string } | null
type ConfirmState =
  | { kind: 'restart' | 'stop' | 'delete'; database: ManagedDatabaseView }
  | null

/**
 * Hub « Bases de données & services » : capacités d’instance, ressources actives et catalogue unifié
 * (moteurs runtime + indexation de services) sans duplication.
 */
export function ProjectDatabases({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DatabasesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [lastDeployment, setLastDeployment] = useState<string | null>(null)
  const [selected, setSelected] = useState<UnifiedService | null>(null)

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

  const model = useMemo(() => {
    if (!data) return null
    return buildServicesHubModel({
      databases: data.databases ?? [],
      engines: data.engines ?? data.available ?? [],
      runtime: data.runtime ?? null,
      canManage: data.canManage,
    })
  }, [data])

  const aliasesByKind = useMemo(() => {
    if (!data) return {}
    const engines = data.engines ?? data.available ?? []
    return Object.fromEntries(engines.map((engine) => [engine.kind, engine.envAliases ?? []]))
  }, [data])

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
      setSelected(null)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setCreating(null)
    }
  }

  async function act(database: ManagedDatabaseView, action: ResourceAction) {
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
      setFeedback({
        tone: 'success',
        message:
          action === 'stop' ? 'Base arrêtée.' : action === 'restart' ? 'Redémarrage lancé.' : 'Base démarrée.',
      })
      setConfirm(null)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  async function remove(database: ManagedDatabaseView) {
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

  if (loading) return <p className="text-sm text-muted-foreground">Chargement des services et des ressources…</p>
  if (!data || !model) return null

  const canManage = model.canManage

  return (
    <div className="space-y-6">
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

      <InstanceCapabilitiesPanel runtime={model.runtime} />

      <section aria-labelledby="services-active-title" className="space-y-3">
        <div>
          <h3 id="services-active-title" className="text-sm font-semibold">Ressources actives</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Bases et services provisionnés pour ce projet.</p>
        </div>
        <ActiveResources
          projectId={projectId}
          databases={model.activeDatabases}
          canManage={canManage}
          workingId={working}
          aliasesByKind={aliasesByKind}
          onRefresh={() => void load()}
          onRequestAction={(database, action) => {
            if (action === 'start') void act(database, 'start')
            else setConfirm({ kind: action, database })
          }}
          onRequestDelete={(database) => setConfirm({ kind: 'delete', database })}
        />
      </section>

      <section aria-labelledby="services-catalog-title" className="space-y-3">
        <div>
          <h3 id="services-catalog-title" className="text-sm font-semibold">Ajouter un service</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Catalogue unifié des bases et services : disponibilité réelle sur cette instance, capacités (sauvegarde,
            restauration, provider) et services référencés (Coolify one-click, EFLEX-géré, à venir). Ouvrez un service pour
            voir sa compatibilité et, si possible, le provisionner.
          </p>
        </div>
        <ServicesBrowser services={model.services} canManage={canManage} onOpen={setSelected} />
      </section>

      <p className="text-xs text-muted-foreground">
        Les ressources sont privées, accessibles depuis le réseau Docker de l’application. Les URLs/credentials sont
        chiffrés et injectés comme variables d’environnement au prochain déploiement lorsque nécessaire. Les capacités
        dépendent du moteur et de l’instance.
      </p>

      <ServiceDetailDialog
        service={selected}
        canManage={canManage}
        creating={creating !== null}
        onClose={() => !creating && setSelected(null)}
        onCreate={(kind) => void create(kind)}
        onViewActive={(kind) => {
          setSelected(null)
          const el = document.getElementById(`resource-${kind}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />

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
