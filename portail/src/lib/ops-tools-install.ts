import { resolveTarget } from '@/lib/coolify'
import {
  createComposeService,
  listCoolifyServices,
  replaceServiceCompose,
  setServiceVariables,
  type CoolifyServiceView,
} from '@/lib/coolify-admin'
import { platformDomain } from '@/lib/custom-domain'
import {
  OPS_TOOLS,
  OPS_TOOL_IDS,
  OPS_USER,
  generateOpsPassword,
  opsServiceName,
  opsToolCompose,
  opsToolHost,
  type OpsToolId,
} from '@/lib/ops-tools'

export interface OpsToolStatus {
  id: OpsToolId
  product: string
  title: string
  description: string
  url: string | null
  installed: boolean
  serviceId: string | null
  status: string | null
  needsAgentKey: boolean
}

export async function listOpsTools(): Promise<{ tools: OpsToolStatus[]; rootDomain: string | null } | { error: string }> {
  const services = await listCoolifyServices()
  if ('error' in services) return services
  const root = platformDomain()
  const byName = new Map<string, CoolifyServiceView>(services.map((service) => [service.name, service]))
  return {
    rootDomain: root,
    tools: OPS_TOOL_IDS.map((id) => {
      const tool = OPS_TOOLS[id]
      const service = byName.get(opsServiceName(id))
      return {
        id,
        product: tool.product,
        title: tool.title,
        description: tool.description,
        url: root ? `https://${opsToolHost(id, root)}` : null,
        installed: Boolean(service),
        serviceId: service?.id ?? null,
        status: service?.status ?? null,
        needsAgentKey: Boolean(tool.needsAgentKey),
      }
    }),
  }
}

export type OpsCredentials = { url: string; user: string; password: string }

/** Installe l'outil dans Coolify. Le mot de passe n'est renvoyé qu'ici : il n'est stocké nulle part. */
export async function installOpsTool(id: OpsToolId): Promise<OpsCredentials | { error: string; status: number }> {
  const root = platformDomain()
  if (!root) return { error: 'Domaine de la plateforme non configuré (PORTAL_DOMAIN).', status: 409 }
  const services = await listCoolifyServices()
  if ('error' in services) return { error: services.error, status: 502 }
  if (services.some((service) => service.name === opsServiceName(id))) {
    return { error: 'Cet outil est déjà installé. Utilisez « Nouveau mot de passe » si vous l’avez perdu.', status: 409 }
  }
  let target
  try {
    target = await resolveTarget()
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Hébergement injoignable.', status: 502 }
  }
  const host = opsToolHost(id, root)
  const password = generateOpsPassword()
  const created = await createComposeService({
    name: opsServiceName(id),
    description: `${OPS_TOOLS[id].product} — outil d'exploitation installé par E-FLEX`,
    compose: opsToolCompose(id, host, password),
    serverUuid: target.serverUuid,
    projectUuid: target.projectUuid,
    environmentName: target.environmentName,
  })
  if ('error' in created) return { error: created.error, status: 502 }
  return { url: `https://${host}`, user: OPS_USER, password }
}

async function installedService(id: OpsToolId): Promise<CoolifyServiceView | { error: string; status: number }> {
  const services = await listCoolifyServices()
  if ('error' in services) return { error: services.error, status: 502 }
  const service = services.find((item) => item.name === opsServiceName(id))
  return service ?? { error: 'Cet outil n’est pas installé.', status: 404 }
}

/** Génère un nouveau mot de passe d'accès et redémarre l'outil. */
export async function rotateOpsPassword(id: OpsToolId): Promise<OpsCredentials | { error: string; status: number }> {
  const root = platformDomain()
  if (!root) return { error: 'Domaine de la plateforme non configuré (PORTAL_DOMAIN).', status: 409 }
  const service = await installedService(id)
  if ('error' in service) return service
  const host = opsToolHost(id, root)
  const password = generateOpsPassword()
  const result = await replaceServiceCompose(service.id, opsToolCompose(id, host, password))
  if ('error' in result) return { error: result.error, status: 502 }
  return { url: `https://${host}`, user: OPS_USER, password }
}

/** Beszel : enregistre la clé publique et le jeton donnés par le hub, puis redémarre l'agent. */
export async function setBeszelAgentKey(key: string, token: string): Promise<{ ok: true } | { error: string; status: number }> {
  const service = await installedService('metrics')
  if ('error' in service) return service
  const result = await setServiceVariables(service.id, { KEY: key, TOKEN: token })
  if ('error' in result) return { error: result.error, status: 502 }
  return { ok: true }
}
