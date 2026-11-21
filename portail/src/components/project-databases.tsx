'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Play, RefreshCw, RotateCw, Square, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { ServiceIcon } from '@/components/service-icon'
import { cn } from '@/lib/utils'
import { InstanceCapabilitiesPanel } from '@/components/services-hub/instance-capabilities-panel'
import { ActiveResources, type ResourceAction } from '@/components/services-hub/active-resources'
import { ActiveServiceManager } from '@/components/services-hub/active-service-manager'
import { ServicesBrowser } from '@/components/services-hub/services-browser'
import { ServiceDetailDialog } from '@/components/services-hub/service-detail-dialog'
import {
  buildServicesHubModel,
  type ActiveServiceView,
  type EngineInfoView,
  type ManagedDatabaseView,
  type RuntimeView,
  type ServiceTypeCapabilitiesView,
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
  | { kind: 'service-start' | 'service-stop' | 'service-restart' | 'service-delete'; service: ActiveServiceView }
  | null

const SVC_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'muted' | 'danger' }> = {
  running: { label: 'En ligne', tone: 'success' },
  starting: { label: 'Démarrage…', tone: 'warning' },
  restarting: { label: 'Redémarrage…', tone: 'warning' },
  exited: { label: 'Arrêté', tone: 'muted' },
  stopped: { label: 'Arrêté', tone: 'muted' },
}
const svcStatus = (status: string | null) => {
  const base = (status ?? 'unknown').split(':')[0] ?? 'unknown'
  if (base === 'running' && status?.includes('unhealthy')) return { label: 'Healthcheck en échec', tone: 'warning' as const }
  return SVC_STATUS[base] ?? { label: status ?? 'Inconnu', tone: 'muted' as const }
}
const DOT: Record<string, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', muted: 'bg-muted-foreground/50' }

export function ProjectDatabases({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DatabasesResponse | null>(null)
  const [activeServices, setActiveServices] = useState<ActiveServiceView[]>([])
  const [serviceCapabilities, setServiceCapabilities] = useState<ServiceTypeCapabilitiesView | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [lastDeployment, setLastDeployment] = useState<string | null>(null)
  const [selected, setSelected] = useState<UnifiedService | null>(null)

  const load = useCallback(async () => {
    try {
      const [dbRes, svcRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/databases`, { cache: 'no-store' }),
        fetch(`/api/projects/${projectId}/coolify-services`, { cache: 'no-store' }).catch(() => null),
      ])
      const body = await dbRes.json().catch(() => ({}))
      if (!dbRes.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Bases indisponibles.' })
        return
      }
      setData(body as DatabasesResponse)
      if (svcRes?.ok) {
        const svcBody = (await svcRes.json().catch(() => ({}))) as { services?: ActiveServiceView[]; capabilities?: ServiceTypeCapabilitiesView }
        setActiveServices(Array.isArray(svcBody.services) ? svcBody.services : [])
        setServiceCapabilities(svcBody.capabilities ?? null)
      } else {
        setActiveServices([])
        setServiceCapabilities(null)
      }
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  const model = useMemo(() => {
    if (!data) return null
    return buildServicesHubModel({
      databases: data.databases ?? [],
      engines: data.engines ?? data.available ?? [],
      runtime: data.runtime ?? null,
      canManage: data.canManage,
      activeServices,
      serviceTypeCapabilities: serviceCapabilities,
    })
  }, [data, activeServices, serviceCapabilities])

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
      if (!response.ok) { setFeedback({ tone: 'error', message: body.error ?? 'Création impossible.' }); return }
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

  async function createService(catalogId: string) {
    setCreating(catalogId)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/coolify-services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setFeedback({ tone: 'error', message: body.error ?? 'Provisionnement impossible.' }); return }
      setFeedback({ tone: 'success', message: 'Service Coolify en cours de provisionnement. Son état sera disponible après démarrage.' })
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
      if (!response.ok) { setFeedback({ tone: 'error', message: body.error ?? 'Action impossible.' }); return }
      setFeedback({ tone: 'success', message: action === 'stop' ? 'Base arrêtée.' : action === 'restart' ? 'Redémarrage lancé.' : 'Base démarrée.' })
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
      if (!response.ok) { setFeedback({ tone: 'error', message: body.error ?? 'Suppression impossible.' }); return }
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

  async function actService(service: ActiveServiceView, action: 'start' | 'stop' | 'restart') {
    setWorking(service.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/coolify-services/${service.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setFeedback({ tone: 'error', message: body.error ?? 'Action impossible.' }); return }
      setFeedback({ tone: 'success', message: action === 'stop' ? 'Service arrêté.' : action === 'restart' ? 'Redémarrage lancé.' : 'Service démarré.' })
      setConfirm(null)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally { setWorking(null) }
  }

  async function removeService(service: ActiveServiceView) {
    setWorking(service.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/coolify-services/${service.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) { setFeedback({ tone: 'error', message: body.error ?? 'Suppression impossible.' }); return }
      setFeedback({ tone: 'success', message: 'Service supprimé.' })
      setConfirm(null)
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally { setWorking(null) }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement des services et des ressources…</p>
  if (!data || !model) return null

  const canManage = model.canManage

  return (
    <div className="space-y-6">
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={feedback.tone === 'error'
            ? 'rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'
            : 'rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground'}
        >
          {feedback.message}
          {lastDeployment && (
            <> <Link href={`/dashboard/projects/${projectId}?tab=deployments`} className="font-medium text-primary hover:underline">Voir le déploiement</Link></>
          )}
        </p>
      )}

      <InstanceCapabilitiesPanel runtime={model.runtime} />

      {serviceCapabilities && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
          <p className="font-medium text-foreground">
            Découverte des services one-click :{' '}
            {serviceCapabilities.source === 'instance' ? 'types supportés détectés sur l’instance' : 'basée sur le catalogue EFLEX (support non confirmé)'}
          </p>
          {serviceCapabilities.message && (
            <p className="mt-1 text-muted-foreground">{serviceCapabilities.message}</p>
          )}
          {serviceCapabilities.source === 'instance' && serviceCapabilities.instanceTypes && (
            <p className="mt-1 text-muted-foreground">
              Types annoncés : <span className="font-mono text-foreground">{serviceCapabilities.instanceTypes.slice(0, 20).join(', ')}{serviceCapabilities.instanceTypes.length > 20 ? '…' : ''}</span>
            </p>
          )}
        </div>
      )}

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

        {activeServices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Services Coolify</p>
            <ul className="space-y-2">
              {activeServices.map((service) => {
                const view = svcStatus(service.status)
                const stopped = (service.status ?? '').startsWith('exited') || (service.status ?? '').startsWith('stopped')
                return (
                  <li key={service.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <ServiceIcon kind={service.catalogId} label={service.label} className="h-7 w-7" />
                          {service.label}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Service Coolify</span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', DOT[view.tone])} />
                          {view.label}
                          <span className="font-mono">{service.name}</span>
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
                          {stopped ? (
                            <Button type="button" size="sm" loading={working === service.id} onClick={() => void actService(service, 'start')}><Play className="h-3.5 w-3.5" aria-hidden="true" />Démarrer</Button>
                          ) : (
                            <>
                              <Button type="button" variant="outline" size="sm" loading={working === service.id} onClick={() => setConfirm({ kind: 'service-restart', service })}><RotateCw className="h-3.5 w-3.5" aria-hidden="true" />Redémarrer</Button>
                              <Button type="button" variant="destructive" size="sm" loading={working === service.id} onClick={() => setConfirm({ kind: 'service-stop', service })}><Square className="h-3.5 w-3.5" aria-hidden="true" />Arrêter</Button>
                            </>
                          )}
                          <Button type="button" variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Actualiser</Button>
                          <Button type="button" variant="ghost" size="sm" loading={working === service.id} onClick={() => setConfirm({ kind: 'service-delete', service })}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Supprimer</Button>
                        </div>
                      )}
                    </div>
                    <ActiveServiceManager
                      projectId={projectId}
                      serviceId={service.id}
                      serviceLabel={service.label}
                      canManage={canManage}
                      onChanged={() => void load()}
                    />
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">Les services one-click sont créés dans Coolify. Ouvrez « Configurer » pour gérer les variables d’environnement, les domaines/FQDN et consulter la configuration/les volumes exposés par l’API (selon les capacités de l’instance).</p>
          </div>
        )}
      </section>

      <section aria-labelledby="services-catalog-title" className="space-y-3">
        <div>
          <h3 id="services-catalog-title" className="text-sm font-semibold">Ajouter un service</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Catalogue unifié des bases et services : disponibilité réelle sur cette instance, capacités par opération (provisionnement, cycle de vie, sauvegarde, restauration), provider sélectionné par politique, prérequis et limites. Ouvrez un service pour voir sa compatibilité et, si possible, le provisionner (bases managées, services Coolify, candidats EFLEX-gérés).
          </p>
        </div>
        <ServicesBrowser services={model.services} canManage={canManage} onOpen={setSelected} />
      </section>

      <p className="text-xs text-muted-foreground">
        Les ressources sont privées, accessibles depuis le réseau Docker de l’application. Les URLs/credentials sont chiffrés et injectés comme variables d’environnement au prochain déploiement lorsque nécessaire. Les capacités dépendent du moteur et de l’instance.
      </p>

      <ServiceDetailDialog
        service={selected}
        canManage={canManage}
        creating={creating !== null}
        onClose={() => !creating && setSelected(null)}
        onCreate={(kind) => void create(kind)}
        onCreateService={(catalogId) => void createService(catalogId)}
        onViewActive={(kind) => {
          setSelected(null)
          document.getElementById(`resource-${kind}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />

      <ConfirmDialog open={confirm?.kind === 'restart'} title={`Redémarrer ${confirm && 'database' in confirm ? confirm.database.label : 'la base'} ?`} description="La base sera brièvement indisponible pour l’application." confirmLabel="Redémarrer" onConfirm={() => (confirm && 'database' in confirm ? act(confirm.database, 'restart') : undefined)} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.kind === 'stop'} title={`Arrêter ${confirm && 'database' in confirm ? confirm.database.label : 'la base'} ?`} description="L’application perdra l’accès à sa base jusqu’au redémarrage." confirmLabel="Arrêter la base" destructive onConfirm={() => (confirm && 'database' in confirm ? act(confirm.database, 'stop') : undefined)} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.kind === 'delete'} title={`Supprimer ${confirm && 'database' in confirm ? confirm.database.label : 'la base'} ?`} description="La base et ses données seront définitivement supprimées. Les sauvegardes conservées côté hébergement (locales ou copie S3, selon la planification) peuvent être supprimées avec la ressource ou selon la rétention du fournisseur : vérifiez qu’une sauvegarde exploitable hors du serveur existe si nécessaire. La variable d’environnement associée sera retirée au prochain déploiement." confirmLabel="Supprimer la base" destructive onConfirm={() => (confirm && 'database' in confirm ? remove(confirm.database) : undefined)} onCancel={() => setConfirm(null)} />

      <ConfirmDialog open={confirm?.kind === 'service-restart'} title={`Redémarrer ${confirm && 'service' in confirm ? confirm.service.label : 'le service'} ?`} description="Le service sera brièvement indisponible." confirmLabel="Redémarrer" onConfirm={() => (confirm && 'service' in confirm ? actService(confirm.service, 'restart') : undefined)} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.kind === 'service-stop'} title={`Arrêter ${confirm && 'service' in confirm ? confirm.service.label : 'le service'} ?`} description="Le service sera arrêté jusqu’au redémarrage." confirmLabel="Arrêter le service" destructive onConfirm={() => (confirm && 'service' in confirm ? actService(confirm.service, 'stop') : undefined)} onCancel={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.kind === 'service-delete'} title={`Supprimer ${confirm && 'service' in confirm ? confirm.service.label : 'le service'} ?`} description="Le service Coolify et ses configurations associées seront supprimés (les volumes ne sont pas supprimés automatiquement par cette action). Cette action est irréversible." confirmLabel="Supprimer le service" destructive onConfirm={() => (confirm && 'service' in confirm ? removeService(confirm.service) : undefined)} onCancel={() => setConfirm(null)} />
    </div>
  )
}
