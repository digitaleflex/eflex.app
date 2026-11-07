// Client de l'API Coolify v4 (https://coolify.io/docs/api-reference).
//
// Chemins, champs et formes de réponse suivent la spécification OpenAPI officielle :
//   POST /applications/public          → 201 { uuid }
//   POST /applications/{uuid}/envs     → 201 { uuid }
//   POST /deploy?uuid=…                → 200 { deployments: [{ deployment_uuid, … }] }
//   GET  /deployments/{uuid}           → { status, commit, logs, … }
//   DELETE /applications/{uuid}
//   GET  /health                       → 200, texte « OK »
// Les réponses ne sont PAS enveloppées dans `{ data }`.
//
// Variables d'environnement : voir loadCoolifyConfig().

export class CoolifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'CoolifyError'
  }
}

export interface CoolifyConfig {
  /** URL de l'API, toujours terminée par /api/v1. */
  apiUrl: string
  token: string
  serverUuid: string
  projectUuid: string
  environmentName: string
  destinationUuid?: string
  /** Domaine parent des applications (`apps.exemple.fr` → `mon-projet.apps.exemple.fr`). */
  appsDomain?: string
}

const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
const UUID_RE = /^[A-Za-z0-9_-]{6,64}$/

/** Lit la configuration dans l'environnement ; lève une CoolifyError claire si elle est incomplète. */
export function loadCoolifyConfig(env: Record<string, string | undefined> = process.env): CoolifyConfig {
  const get = (name: string): string => (env[name] ?? '').trim()

  const required = ['COOLIFY_API_URL', 'COOLIFY_API_TOKEN', 'COOLIFY_SERVER_UUID', 'COOLIFY_PROJECT_UUID']
  const missing = required.filter((name) => get(name) === '')
  if (missing.length > 0) {
    throw new CoolifyError(
      `Coolify n'est pas configuré : variable${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`,
    )
  }

  let url: URL
  try {
    url = new URL(get('COOLIFY_API_URL'))
  } catch {
    throw new CoolifyError("COOLIFY_API_URL n'est pas une URL valide (ex. https://coolify.exemple.fr/api/v1).")
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CoolifyError('COOLIFY_API_URL doit commencer par https:// (ou http:// en local).')
  }
  const base = url.href.replace(/\/+$/, '')
  const apiUrl = base.endsWith('/api/v1') ? base : `${base}/api/v1`

  for (const name of ['COOLIFY_SERVER_UUID', 'COOLIFY_PROJECT_UUID'] as const) {
    if (!UUID_RE.test(get(name))) throw new CoolifyError(`${name} n'a pas le format d'un identifiant Coolify.`)
  }

  const appsDomain = get('COOLIFY_APPS_DOMAIN').replace(/^\*\./, '').toLowerCase()
  if (appsDomain !== '' && !HOSTNAME_RE.test(appsDomain)) {
    throw new CoolifyError("COOLIFY_APPS_DOMAIN n'est pas un nom de domaine valide (ex. apps.exemple.fr).")
  }

  const destination = get('COOLIFY_DESTINATION_UUID')
  return {
    apiUrl,
    token: get('COOLIFY_API_TOKEN'),
    serverUuid: get('COOLIFY_SERVER_UUID'),
    projectUuid: get('COOLIFY_PROJECT_UUID'),
    environmentName: get('COOLIFY_ENVIRONMENT_NAME') || 'production',
    ...(destination ? { destinationUuid: destination } : {}),
    ...(appsDomain ? { appsDomain } : {}),
  }
}

export interface CoolifyDeployment {
  status: string
  commit?: string
  logs?: string
}

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Extrait un message lisible d'une erreur Coolify : `{ message, errors: { champ: [..] } }`. */
function errorDetail(body: unknown): string {
  if (!isRecord(body)) return ''
  const parts: string[] = []
  if (typeof body.message === 'string') parts.push(body.message)
  if (isRecord(body.errors)) {
    for (const [field, messages] of Object.entries(body.errors)) {
      parts.push(`${field} : ${Array.isArray(messages) ? messages.join(', ') : String(messages)}`)
    }
  }
  return parts.join(' — ').slice(0, 300)
}

export class CoolifyClient {
  constructor(
    private readonly config: CoolifyConfig,
    private readonly doFetch: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  /** Nom d'hôte public d'un projet, ou undefined si COOLIFY_APPS_DOMAIN n'est pas défini. */
  domainFor(slug: string): string | undefined {
    return this.config.appsDomain ? `${slug}.${this.config.appsDomain}` : undefined
  }

  private async request(
    method: string,
    path: string,
    options: { body?: Json; notFound?: string; text?: boolean } = {},
  ): Promise<unknown> {
    let res: Response
    try {
      res = await this.doFetch(`${this.config.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new CoolifyError('Coolify est injoignable. Vérifiez COOLIFY_API_URL et le réseau.')
    }

    if (options.text && res.ok) return res.text()

    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // Corps absent ou non JSON : on s'en tient au code HTTP.
    }

    if (!res.ok) {
      const detail = errorDetail(body)
      switch (res.status) {
        case 401:
          throw new CoolifyError('Coolify a refusé le jeton (COOLIFY_API_TOKEN invalide ou expiré).', 401)
        case 403:
          throw new CoolifyError("Le jeton Coolify n'a pas les droits nécessaires (il faut au moins write et deploy).", 403)
        case 404:
          throw new CoolifyError(
            options.notFound ??
              'Ressource introuvable côté Coolify : vérifiez COOLIFY_SERVER_UUID, COOLIFY_PROJECT_UUID et COOLIFY_ENVIRONMENT_NAME.',
            404,
          )
        case 422:
          throw new CoolifyError(`Coolify a refusé la configuration${detail ? ` : ${detail}` : '.'}`, 422)
        default:
          throw new CoolifyError(`Coolify a répondu ${res.status}${detail ? ` : ${detail}` : '.'}`, res.status)
      }
    }
    return body
  }

  /** Crée une application depuis un dépôt public ; l'emplacement vient de la configuration. */
  async createApplication(payload: Json): Promise<{ uuid: string }> {
    const body = await this.request('POST', '/applications/public', {
      body: {
        ...payload,
        project_uuid: this.config.projectUuid,
        server_uuid: this.config.serverUuid,
        environment_name: this.config.environmentName,
        ...(this.config.destinationUuid ? { destination_uuid: this.config.destinationUuid } : {}),
      },
    })
    const uuid = isRecord(body) ? body.uuid : undefined
    if (typeof uuid !== 'string' || !UUID_RE.test(uuid)) {
      throw new CoolifyError("Coolify n'a pas renvoyé l'identifiant de l'application créée.")
    }
    return { uuid }
  }

  /** `is_literal` : la valeur est transmise telle quelle (un « $ » n'est pas interprété). */
  async setEnv(applicationUuid: string, variable: { key: string; value: string }): Promise<void> {
    this.assertUuid(applicationUuid)
    await this.request('POST', `/applications/${applicationUuid}/envs`, {
      body: { key: variable.key, value: variable.value, is_literal: true },
    })
  }

  /** Lance un déploiement et retourne son identifiant. */
  async deploy(applicationUuid: string): Promise<{ deploymentUuid: string }> {
    this.assertUuid(applicationUuid)
    const body = await this.request('POST', `/deploy?uuid=${applicationUuid}`)
    const first = isRecord(body) && Array.isArray(body.deployments) ? body.deployments[0] : undefined
    const deploymentUuid = isRecord(first) ? first.deployment_uuid : undefined
    if (typeof deploymentUuid !== 'string' || !UUID_RE.test(deploymentUuid)) {
      const message = isRecord(first) && typeof first.message === 'string' ? ` (${first.message})` : ''
      throw new CoolifyError(`Coolify n'a pas démarré de déploiement${message}.`)
    }
    return { deploymentUuid }
  }

  async getDeployment(deploymentUuid: string): Promise<CoolifyDeployment> {
    this.assertUuid(deploymentUuid)
    const body = await this.request('GET', `/deployments/${deploymentUuid}`, { notFound: 'Déploiement introuvable côté Coolify.' })
    if (!isRecord(body) || typeof body.status !== 'string') {
      throw new CoolifyError('Réponse inattendue de Coolify pour ce déploiement.')
    }
    return {
      status: body.status,
      ...(typeof body.commit === 'string' ? { commit: body.commit } : {}),
      ...(typeof body.logs === 'string' ? { logs: body.logs } : {}),
    }
  }

  /** Supprime une application (nettoyage après un échec en cours de création). */
  async deleteApplication(applicationUuid: string): Promise<void> {
    this.assertUuid(applicationUuid)
    await this.request(
      'DELETE',
      `/applications/${applicationUuid}?delete_configurations=true&delete_volumes=true&docker_cleanup=true&delete_connected_networks=true`,
    )
  }

  /** Vrai si l'API répond. `/health` renvoie le texte « OK », pas du JSON. */
  async ping(): Promise<boolean> {
    try {
      await this.request('GET', '/health', { text: true })
      return true
    } catch {
      return false
    }
  }

  private assertUuid(value: string): void {
    if (!UUID_RE.test(value)) throw new CoolifyError('Identifiant Coolify invalide.')
  }
}

/** Statut Coolify → statut Eflex (pending, building, live, failed, rollbacked). */
export function mapDeploymentStatus(coolifyStatus: string): string {
  switch (coolifyStatus) {
    case 'queued':
      return 'pending'
    case 'in_progress':
      return 'building'
    case 'finished':
      return 'live'
    case 'failed':
      return 'failed'
    case 'cancelled-by-user':
      return 'rollbacked'
    default:
      return 'pending'
  }
}

/** Dernières lignes utiles des journaux d'un déploiement (JSON d'entrées, ou texte brut). */
export function tailLogs(logs: string | undefined, lines = 12): string {
  if (!logs) return ''
  let outputs: string[]
  try {
    const parsed: unknown = JSON.parse(logs)
    outputs = Array.isArray(parsed)
      ? parsed
          .filter((entry): entry is Json => isRecord(entry) && entry.hidden !== true && typeof entry.output === 'string')
          .map((entry) => entry.output as string)
      : [logs]
  } catch {
    outputs = [logs]
  }
  return outputs
    .flatMap((output) => output.split('\n'))
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .slice(-lines)
    .join('\n')
    .slice(-2_000)
}
