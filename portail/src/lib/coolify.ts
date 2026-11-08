/**
 * Client API Coolify v4.6 — https://coolify.io/docs/api-reference
 *
 * Le cycle d'un déploiement Eflex :
 *   ensureTarget (serveur + projet + environnement)
 *   → createApplication (compose ou Dockerfile)
 *   → setEnvironmentVariable (une par variable)
 *   → deployApplication (POST /deploy)
 *   → getDeploymentStatus / getDeploymentLogs (GET /deployments/{uuid})
 *
 * Le projet et l'environnement sont découverts une seule fois puis mémorisés.
 * `COOLIFY_PROJECT_NAME` (défaut « Eflex »), `COOLIFY_ENVIRONMENT` (défaut
 * « production »), `COOLIFY_PROJECT_UUID` et `COOLIFY_SERVER_UUID` permettent
 * de forcer la cible sans découverte.
 */

const COOLIFY_URL = process.env.COOLIFY_API_URL || ''
const COOLIFY_TOKEN = process.env.COOLIFY_API_TOKEN || ''
const PROJECT_NAME = process.env.COOLIFY_PROJECT_NAME || 'Eflex'
const ENVIRONMENT_NAME = process.env.COOLIFY_ENVIRONMENT || 'production'

interface CoolifyResponse<T> {
  data?: T
  error?: string
}

interface CoolifyProject {
  uuid: string
  name: string
}

interface CoolifyEnvironment {
  uuid: string
  name: string
}

interface CoolifyServer {
  uuid: string
  name?: string
  is_coolify_host?: boolean
  is_usable?: boolean
}

interface CoolifyDeployment {
  status?: string
  logs?: string | null
}

interface CoolifyDeploymentSummary {
  resource_uuid?: string
  deployment_uuid?: string
  message?: string
}

interface Target {
  projectUuid: string
  serverUuid: string
  environmentName: string
}

let targetPromise: Promise<Target> | null = null

async function coolifyFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<CoolifyResponse<T>> {
  if (!COOLIFY_URL || !COOLIFY_TOKEN) {
    return { error: 'Coolify API non configurée. Définissez COOLIFY_API_URL et COOLIFY_API_TOKEN.' }
  }

  const url = `${COOLIFY_URL.replace(/\/$/, '')}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${COOLIFY_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      cache: 'no-store',
    })
  } catch (error) {
    return {
      error: `Coolify API injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`,
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = text.slice(0, 300)
    try {
      const body = JSON.parse(text) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // Réponse non JSON : on garde le texte brut.
    }
    return { error: `Coolify API ${res.status}: ${message || res.statusText}` }
  }

  if (res.status === 204) return {}
  try {
    return { data: (await res.json()) as T }
  } catch {
    return { data: undefined }
  }
}

/** Normalise un domaine saisi par l'utilisateur en nom d'hôte. */
function normalizeHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
}

async function fetchServerUuid(): Promise<string> {
  const configured = process.env.COOLIFY_SERVER_UUID
  if (configured) return configured

  const res = await coolifyFetch<CoolifyServer[]>('/servers')
  if (res.error) throw new Error(res.error)
  const servers = res.data ?? []
  const server =
    servers.find((item) => item.is_coolify_host) ??
    servers.find((item) => item.is_usable) ??
    servers[0]
  if (!server?.uuid) throw new Error('Coolify : aucun serveur disponible.')
  return server.uuid
}

async function fetchProjectUuid(): Promise<string> {
  const configured = process.env.COOLIFY_PROJECT_UUID
  if (configured) return configured

  const list = await coolifyFetch<CoolifyProject[]>('/projects')
  if (list.error) throw new Error(list.error)
  const existing = (list.data ?? []).find((project) => project.name === PROJECT_NAME)
  if (existing?.uuid) return existing.uuid

  const created = await coolifyFetch<{ uuid?: string }>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: PROJECT_NAME }),
  })
  if (created.error) throw new Error(created.error)
  if (!created.data?.uuid) throw new Error('Coolify : création du projet sans UUID.')
  return created.data.uuid
}

async function fetchEnvironmentName(projectUuid: string): Promise<string> {
  const path = `/projects/${encodeURIComponent(projectUuid)}/environments`
  const res = await coolifyFetch<CoolifyEnvironment[]>(path)
  if (res.error) throw new Error(res.error)

  const environments = res.data ?? []
  const existing = environments.find((environment) => environment.name === ENVIRONMENT_NAME)
  if (existing) return existing.name
  if (environments[0]) return environments[0].name

  const created = await coolifyFetch<{ uuid?: string }>(path, {
    method: 'POST',
    body: JSON.stringify({ name: ENVIRONMENT_NAME }),
  })
  if (created.error) throw new Error(created.error)
  return ENVIRONMENT_NAME
}

/**
 * Découvre (et crée au besoin) le serveur, le projet et l'environnement cibles.
 * La promesse est mémorisée pour éviter les créations concurrentes.
 */
async function resolveTarget(): Promise<Target> {
  if (!targetPromise) {
    targetPromise = (async () => {
      const serverUuid = await fetchServerUuid()
      const projectUuid = await fetchProjectUuid()
      const environmentName = await fetchEnvironmentName(projectUuid)
      return { projectUuid, serverUuid, environmentName }
    })().catch((error) => {
      targetPromise = null
      throw error
    })
  }
  return targetPromise
}

export interface CreateApplicationParams {
  name: string
  gitRepository: string
  gitBranch?: string
  /**
   * `dockerfile` : le dépôt contient son Dockerfile (Coolify clone et l'utilise).
   * `nixpacks`   : Coolify construit l'image avec Nixpacks, en utilisant les
   *                commandes du BuildPlan (install/build/start).
   */
  buildPack: 'dockerfile' | 'nixpacks'
  portsExposes: string
  installCommand?: string
  buildCommand?: string
  startCommand?: string
  publishDirectory?: string
  /** Domaine public. */
  fqdn?: string
  /** Labels Traefik (le proxy existant n'est pas géré par Coolify). */
  customLabels?: string[]
  /** Commande exécutée après le déploiement (migrations, etc.). */
  postDeploymentCommand?: string
}

/**
 * Crée une application. Le domaine et les labels Traefik sont fournis par
 * l'appelant : Coolify tourne avec `generate_exact_labels=true` et un proxy
 * `none`, c'est le Traefik existant qui route.
 */
export async function createApplication(
  params: CreateApplicationParams,
): Promise<{ id: string } | { error: string }> {
  try {
    const target = await resolveTarget()
    const host = params.fqdn ? normalizeHost(params.fqdn) : undefined

    const payload: Record<string, unknown> = {
      name: params.name,
      project_uuid: target.projectUuid,
      server_uuid: target.serverUuid,
      environment_name: target.environmentName,
      git_repository: params.gitRepository,
      git_branch: params.gitBranch || 'main',
      build_pack: params.buildPack,
      ports_exposes: params.portsExposes,
      connect_to_docker_network: true,
      // Eflex gère les domaines : pas de domaine sslip.io généré par Coolify.
      autogenerate_domain: false,
    }

    if (params.installCommand) payload.install_command = params.installCommand
    if (params.buildCommand) payload.build_command = params.buildCommand
    if (params.startCommand) payload.start_command = params.startCommand
    if (params.publishDirectory) payload.publish_directory = params.publishDirectory
    if (params.postDeploymentCommand) {
      payload.post_deployment_command = params.postDeploymentCommand
    }

    if (host) {
      payload.domains = `https://${host}`
      const labels = params.customLabels ?? []
      if (labels.length > 0) {
        payload.custom_labels = Buffer.from(labels.join('\n'), 'utf8').toString('base64')
      }
    }

    const res = await coolifyFetch<{ uuid?: string }>('/applications/public', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (res.error) return { error: res.error }
    if (!res.data?.uuid) return { error: 'Coolify n’a pas renvoyé l’UUID de l’application.' }
    return { id: res.data.uuid }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erreur Coolify inconnue.' }
  }
}

/** Déclenche un déploiement et renvoie l'UUID du déploiement Coolify. */
export async function deployApplication(
  appId: string,
): Promise<{ deploymentId: string } | { error: string }> {
  const res = await coolifyFetch<{ deployments?: CoolifyDeploymentSummary[] }>('/deploy', {
    method: 'POST',
    body: JSON.stringify({ uuid: appId }),
  })
  if (res.error) return { error: res.error }

  const deployments = res.data?.deployments ?? []
  const deployment =
    deployments.find((item) => item.resource_uuid === appId) ?? deployments[0]
  if (!deployment?.deployment_uuid) {
    return {
      error: deployment?.message || 'Coolify n’a pas renvoyé d’identifiant de déploiement.',
    }
  }
  return { deploymentId: deployment.deployment_uuid }
}

/** Statut d'un déploiement (`queued`, `in_progress`, `finished`, `failed`…). */
export async function getDeploymentStatus(
  deploymentId: string,
): Promise<{ status: string } | { error: string }> {
  const res = await coolifyFetch<CoolifyDeployment>(
    `/deployments/${encodeURIComponent(deploymentId)}`,
  )
  if (res.error) return { error: res.error }
  return { status: res.data?.status || 'unknown' }
}

/**
 * Décode les logs d'un déploiement. Coolify stocke un tableau JSON d'entrées
 * `{ name, output, hidden? }` ; on restitue le texte brut, ligne par ligne.
 */
export function decodeDeploymentLogs(raw: string | null | undefined): string {
  if (!raw) return ''

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  if (!Array.isArray(parsed)) return raw

  return parsed
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return ''
      const record = entry as Record<string, unknown>
      return typeof record.output === 'string' ? record.output : ''
    })
    .filter((line) => line.length > 0)
    .join('\n')
}

/** Logs de build d'un déploiement (nécessite `read:sensitive`). */
export async function getDeploymentLogs(
  deploymentId: string,
): Promise<{ logs: string } | { error: string }> {
  const res = await coolifyFetch<CoolifyDeployment>(
    `/deployments/${encodeURIComponent(deploymentId)}`,
  )
  if (res.error) return { error: res.error }
  return { logs: decodeDeploymentLogs(res.data?.logs) }
}

/** Ajoute ou met à jour une variable d'environnement d'une application. */
export async function setEnvironmentVariable(
  appId: string,
  key: string,
  value: string,
  buildtime = false,
): Promise<{ ok: boolean } | { error: string }> {
  const path = `/applications/${encodeURIComponent(appId)}/envs`
  const body = JSON.stringify({ key, value, ...(buildtime ? { is_buildtime: true } : {}) })

  const res = await coolifyFetch(path, { method: 'POST', body })
  if (!res.error) return { ok: true }

  // Coolify renvoie 409 quand la variable existe déjà (par exemple une
  // variable Nixpacks créée à la création de l'application) : on la met à jour.
  if (res.error.includes('already exists')) {
    const patched = await coolifyFetch(path, { method: 'PATCH', body })
    if (patched.error) return { error: patched.error }
    return { ok: true }
  }

  return { error: res.error }
}

/** Liste les applications de l'équipe. */
export async function listApplications(): Promise<
  { applications: Array<Record<string, unknown>> } | { error: string }
> {
  const res = await coolifyFetch<Array<Record<string, unknown>>>('/applications')
  if (res.error) return { error: res.error }
  return { applications: res.data ?? [] }
}

/**
 * Vérifie si l'API Coolify est accessible.
 *
 * `/health` renvoie « OK » en texte brut, pas du JSON : on ne peut pas passer
 * par `coolifyFetch` (qui appelle `res.json()` et lèverait une exception).
 */
export async function checkConnection(): Promise<boolean> {
  if (!COOLIFY_URL || !COOLIFY_TOKEN) return false
  try {
    const res = await fetch(`${COOLIFY_URL.replace(/\/$/, '')}/health`, {
      headers: { Authorization: `Bearer ${COOLIFY_TOKEN}` },
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}
