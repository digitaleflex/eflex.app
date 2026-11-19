import { createOneClickService, deleteServiceInstance, getServiceInstance, listTargetServices, restartService, startService, stopService, type CoolifyServiceInstance } from '@/lib/coolify'
import { MANAGED_SERVICES_CATALOG } from '@/lib/managed-services-catalog'

export type ProjectServiceView = {
  id: string
  name: string
  status: string | null
  catalogId: string
  label: string
}

const SUPPORTED = new Map(
  MANAGED_SERVICES_CATALOG.filter((e) => e.coolifyServiceType).map((e) => [e.id, { type: e.coolifyServiceType as string, label: e.label }]),
)

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'app'
}

export function projectServicePrefix(projectSlug: string): string {
  return `eflex-${sanitizeToken(projectSlug)}-svc-`
}

export function projectServiceName(projectSlug: string, catalogId: string): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${projectServicePrefix(projectSlug)}${sanitizeToken(catalogId)}-${suffix}`.slice(0, 60)
}

function detectCatalogId(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null
  const rest = name.slice(prefix.length)
  // rest is "<catalogId>-<rand>" or "<catalogId>"
  for (const catalogId of SUPPORTED.keys()) {
    if (rest === catalogId || rest.startsWith(`${catalogId}-`)) return catalogId
  }
  // fallback: strip trailing -xxxx
  return rest.replace(/-[a-z0-9]{4}$/, '') || null
}

export function isSupportedCatalogService(catalogId: string): boolean {
  return SUPPORTED.has(catalogId)
}

export function supportedServiceEntries() {
  return MANAGED_SERVICES_CATALOG.filter((e) => e.coolifyServiceType)
}

export async function listProjectCoolifyServices(projectSlug: string): Promise<{ services: ProjectServiceView[] } | { error: string }> {
  const listed = await listTargetServices()
  if ('error' in listed) return listed
  const prefix = projectServicePrefix(projectSlug)
  const services: ProjectServiceView[] = []
  for (const service of listed.services) {
    const catalogId = detectCatalogId(service.name, prefix)
    if (!catalogId) continue
    const supported = SUPPORTED.get(catalogId)
    services.push({
      id: service.id,
      name: service.name,
      status: service.status,
      catalogId,
      label: supported?.label ?? catalogId,
    })
  }
  return { services }
}

export async function createProjectCoolifyService(
  projectSlug: string,
  catalogId: string,
): Promise<{ service: { id: string; catalogId: string } } | { error: string; status?: number }> {
  const entry = SUPPORTED.get(catalogId)
  if (!entry) return { error: 'Ce service n’est pas disponible au provisionnement automatique pour le moment.', status: 400 }
  const existing = await listProjectCoolifyServices(projectSlug)
  if (!('error' in existing) && existing.services.some((s) => s.catalogId === catalogId)) {
    return { error: 'Ce service est déjà provisionné pour ce projet.', status: 409 }
  }
  const created = await createOneClickService(entry.type, projectServiceName(projectSlug, catalogId))
  if ('error' in created) return { error: created.error, status: 502 }
  return { service: { id: created.id, catalogId } }
}

export async function serviceAction(serviceId: string, action: 'start' | 'stop' | 'restart'): Promise<{ ok: true } | { error: string }> {
  if (action === 'start') return startService(serviceId)
  if (action === 'stop') return stopService(serviceId)
  return restartService(serviceId)
}

export { deleteServiceInstance, getServiceInstance }
export type { CoolifyServiceInstance }
