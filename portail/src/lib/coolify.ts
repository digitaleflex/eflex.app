/**
 * Coolify API client — REST wrapper for server management + deployments.
 * https://coolify.io/docs/api-reference
 *
 * Requires COOLIFY_API_URL and COOLIFY_API_TOKEN in env.
 */

const COOLIFY_URL = process.env.COOLIFY_API_URL || ''
const COOLIFY_TOKEN = process.env.COOLIFY_API_TOKEN || ''

interface CoolifyResponse<T = unknown> {
  data?: T
  message?: string
  error?: string
}

interface CoolifyApplication {
  id: string
  name: string
  fqdn?: string
  git_repository?: string
  git_branch?: string
  build_pack?: string
  ports_exposes?: string
  status?: string
}

interface CoolifyDeployment {
  id: string
  application_id: string
  status: string
  commit?: string
  logs?: string
  created_at: string
}

async function coolifyFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<CoolifyResponse<T>> {
  if (!COOLIFY_URL || !COOLIFY_TOKEN) {
    return { error: 'Coolify API non configurée. Définissez COOLIFY_API_URL et COOLIFY_API_TOKEN.' }
  }

  const url = `${COOLIFY_URL.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    return { error: `Coolify API error ${res.status}: ${text.slice(0, 200)}` }
  }

  return res.json()
}

// ============================================================================
// Applications
// ============================================================================

/** Crée une application Coolify à partir d'un dépôt Git (public ou privé). */
export async function createApplication(params: {
  name: string
  gitRepository: string
  gitBranch?: string
  buildPack?: 'nixpacks' | 'dockerfile' | 'dockercompose'
  portsExposes?: string
  fqdn?: string
}): Promise<{ id: string } | { error: string }> {
  const res = await coolifyFetch<{ uuid: string }>('/applications/public', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      git_repository: params.gitRepository,
      git_branch: params.gitBranch || 'main',
      build_pack: params.buildPack || 'nixpacks',
      ports_exposes: params.portsExposes || '3000',
      fqdn: params.fqdn || '',
    }),
  })

  if (res.error) return { error: res.error }
  return { id: res.data?.uuid || '' }
}

/** Déclenche un nouveau déploiement pour une application Coolify. */
export async function deployApplication(
  appId: string
): Promise<{ deploymentId: string } | { error: string }> {
  const res = await coolifyFetch<{ deployment_uuid: string }>(
    `/applications/${appId}/deploy`,
    { method: 'POST' }
  )

  if (res.error) return { error: res.error }
  return { deploymentId: res.data?.deployment_uuid || '' }
}

/** Récupère le statut d'un déploiement. */
export async function getDeploymentStatus(
  appId: string,
  deploymentId: string
): Promise<{ status: string } | { error: string }> {
  const res = await coolifyFetch<CoolifyDeployment>(
    `/applications/${appId}/deployments/${deploymentId}`
  )

  if (res.error) return { error: res.error }
  return { status: res.data?.status || 'unknown' }
}

/** Ajoute ou met à jour une variable d'environnement pour une app Coolify. */
export async function setEnvironmentVariable(
  appId: string,
  key: string,
  value: string
): Promise<{ ok: boolean } | { error: string }> {
  const res = await coolifyFetch('/applications/' + appId + '/environment-variables', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  })

  if (res.error) return { error: res.error }
  return { ok: true }
}

/** Récupère les logs d'un déploiement. */
export async function getDeploymentLogs(
  appId: string,
  deploymentId: string
): Promise<{ logs: string } | { error: string }> {
  const res = await coolifyFetch<{ logs: string }>(
    `/applications/${appId}/deployments/${deploymentId}/logs`
  )

  if (res.error) return { error: res.error }
  return { logs: res.data?.logs || '' }
}

/** Liste les applications sur le serveur Coolify. */
export async function listApplications(): Promise<
  { applications: CoolifyApplication[] } | { error: string }
> {
  const res = await coolifyFetch<CoolifyApplication[]>('/applications')

  if (res.error) return { error: res.error }
  return { applications: res.data || [] }
}

/** Vérifie si l'API Coolify est accessible. */
export async function checkConnection(): Promise<boolean> {
  const res = await coolifyFetch('/health')
  return !res.error
}