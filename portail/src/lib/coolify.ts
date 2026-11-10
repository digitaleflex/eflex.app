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
import { isCommitSha } from '@/lib/deployment-rollback'

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
    return { error: 'Service de déploiement non configuré. Définissez COOLIFY_API_URL et COOLIFY_API_TOKEN.' }
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
      signal: options.signal ?? AbortSignal.timeout(20_000),
      cache: 'no-store',
    })
  } catch (error) {
    return {
      error: `Service de déploiement injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`,
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = text.slice(0, 300)
    try {
      const body = JSON.parse(text) as {
        message?: string
        errors?: Record<string, string[] | string>
      }
      if (body.message) message = body.message
      // Laravel renvoie `{ message, errors: { champ: [messages] } }` sur 422.
      // Sans ce détail, l'interface n'affiche qu'un « Validation failed » inutile.
      if (body.errors && typeof body.errors === 'object') {
        const details = Object.entries(body.errors)
          .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
          .join(' ; ')
        if (details) message = `${body.message ?? 'Validation failed.'} (${details})`
      }
    } catch {
      // Réponse non JSON : on garde le texte brut.
    }
    return { error: `Hébergement API ${res.status}: ${message || res.statusText}` }
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
  if (!server?.uuid) throw new Error('Hébergement : aucun serveur disponible.')
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
  if (!created.data?.uuid) throw new Error('Hébergement : création du projet sans identifiant.')
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
  /**
   * Répertoire de travail Coolify (chemin absolu dans le clone). Omis quand il
   * vaut la valeur par défaut `/`.
   */
  baseDirectory?: string
  installCommand?: string
  buildCommand?: string
  startCommand?: string
  publishDirectory?: string
  /** Dockerfile relatif à `baseDirectory` (framework `docker`). */
  dockerfileLocation?: string
  /** Domaine public principal. */
  fqdn?: string
  /** Tous les domaines publics (principal + personnalisés). Prioritaire sur `fqdn`. */
  domains?: readonly string[]
  /** Labels Traefik (le proxy existant n'est pas géré par Coolify). */
  customLabels?: string[]
  /** Commande exécutée après le déploiement (migrations, etc.). */
  postDeploymentCommand?: string
  /** Clé privée Coolify à utiliser pour cloner un dépôt privé (deploy key). */
  privateKeyUuid?: string
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
    const hosts = (params.domains ?? (params.fqdn ? [params.fqdn] : []))
      .map(normalizeHost)
      .filter((host) => host.length > 0)

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
      // Coolify ne doit ni régénérer les labels Traefik (il ne connaît pas nos
      // entrypoints `websecure` / résolveur `letsencrypt`) ni déclencher de
      // déploiement concurrent : c'est le webhook Eflex qui décide.
      is_container_label_readonly_enabled: false,
      is_auto_deploy_enabled: false,
    }

    if (params.privateKeyUuid) payload.private_key_uuid = params.privateKeyUuid
    if (params.baseDirectory) payload.base_directory = params.baseDirectory
    if (params.dockerfileLocation) payload.dockerfile_location = params.dockerfileLocation

    if (params.installCommand) payload.install_command = params.installCommand
    if (params.buildCommand) payload.build_command = params.buildCommand
    if (params.startCommand) payload.start_command = params.startCommand
    if (params.publishDirectory) payload.publish_directory = params.publishDirectory
    if (params.postDeploymentCommand) {
      payload.post_deployment_command = params.postDeploymentCommand
    }

    if (hosts.length > 0) {
      payload.domains = hosts.map((host) => `https://${host}`).join(',')
      const labels = params.customLabels ?? []
      if (labels.length > 0) {
        payload.custom_labels = Buffer.from(labels.join('\n'), 'utf8').toString('base64')
      }
    }

    const res = await coolifyFetch<{ uuid?: string }>(
      params.privateKeyUuid ? '/applications/private-deploy-key' : '/applications/public',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
    if (res.error) return { error: res.error }
    if (!res.data?.uuid) return { error: 'L’hébergement n’a pas renvoyé l’identifiant de l’application.' }
    return { id: res.data.uuid }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erreur d’hébergement inconnue.' }
  }
}

/** Met à jour les commandes, le dossier de travail et le port d'une application existante. */
export async function updateApplication(
  appId: string,
  params: {
    baseDirectory?: string | null
    dockerfileLocation?: string | null
    installCommand?: string | null
    buildCommand?: string | null
    startCommand?: string | null
    publishDirectory?: string | null
    portsExposes?: string
  },
): Promise<{ ok: true } | { error: string }> {
  const payload: Record<string, unknown> = {}
  if (params.baseDirectory !== undefined) payload.base_directory = params.baseDirectory
  if (params.dockerfileLocation !== undefined) payload.dockerfile_location = params.dockerfileLocation
  if (params.installCommand !== undefined) payload.install_command = params.installCommand
  if (params.buildCommand !== undefined) payload.build_command = params.buildCommand
  if (params.startCommand !== undefined) payload.start_command = params.startCommand
  if (params.publishDirectory !== undefined) payload.publish_directory = params.publishDirectory
  if (params.portsExposes !== undefined) payload.ports_exposes = params.portsExposes

  const res = await coolifyFetch(`/applications/${encodeURIComponent(appId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (res.error) return { error: res.error }
  return { ok: true }
}

/** Déclenche un déploiement et renvoie l'UUID du déploiement Coolify. */export async function deployApplication(
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
      error: deployment?.message || 'L’hébergement n’a pas renvoyé d’identifiant de déploiement.',
    }
  }
  return { deploymentId: deployment.deployment_uuid }
}

/**
 * Déploie un commit précis : retour arrière vers une version déjà livrée.
 *
 * Endpoint retenu (Coolify 4.7.3, `routes/api.php`) :
 *   `POST /applications/{uuid}/rollback` avec `{ commit: "<sha40>" }`
 * → `{ deployment_uuid }`. Coolify refuse (422) un commit qui n'est ni une
 * image de retour de l'application ni le commit d'un déploiement **réussi**
 * de cette application (`GetRollbackImages::allows`). C'est la garantie qu'on
 * ne « déploie » pas un commit jamais construit.
 *
 * Cet appel ne touche ni `git_branch` ni `git_commit_sha` de l'application :
 * l'épinglage ne dure que le temps du déploiement. L'alternative — PATCH de
 * `git_commit_sha` puis `/deploy` puis restauration — laisserait l'application
 * épinglée sur l'ancien commit entre les deux appels (et si le processus meurt,
 * définitivement). C'est pour cela qu'elle n'est pas utilisée.
 */
export async function deployApplicationCommit(
  appId: string,
  commitSha: string,
): Promise<{ deploymentId: string } | { error: string }> {
  if (!isCommitSha(commitSha)) {
    return {
      error:
        'Commit de retour invalide : un identifiant complet de 40 caractères hexadécimaux est requis.',
    }
  }

  const res = await coolifyFetch<{ deployment_uuid?: string; message?: string }>(
    `/applications/${encodeURIComponent(appId)}/rollback`,
    { method: 'POST', body: JSON.stringify({ commit: commitSha }) },
  )
  if (res.error) {
    if (res.error.includes('Hébergement API 422')) {
      return {
        error:
          'L’hébergement refuse ce retour arrière : ce commit n’a pas été déployé avec succès pour cette application, ou son image n’est plus disponible.',
      }
    }
    return { error: res.error }
  }

  const deploymentId = res.data?.deployment_uuid
  if (!deploymentId) {
    return {
      error:
        res.data?.message ||
        'L’hébergement n’a pas renvoyé d’identifiant de déploiement pour ce retour arrière.',
    }
  }
  return { deploymentId }
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

/**
 * Annule un déploiement en cours côté Coolify.
 *
 * Endpoint réel (Coolify 4.7+, `routes/api.php`) :
 * `POST /deployments/{uuid}/cancel`. Coolify n'accepte l'annulation que d'un
 * déploiement `queued` ou `in_progress` ; il répond **400** pour un déploiement
 * déjà terminé. Ce n'est pas une panne d'infrastructure : on le signale comme
 * « déjà terminé » pour que l'appelant puisse tout de même fixer l'état local.
 */
export async function cancelDeployment(
  deploymentId: string,
): Promise<{ ok: true; alreadyFinished?: boolean } | { error: string }> {
  const res = await coolifyFetch(`/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
    method: 'POST',
  })
  if (res.error) {
    if (res.error.includes('cannot be cancelled') || res.error.includes('Hébergement API 404')) {
      return { ok: true, alreadyFinished: true }
    }
    return { error: res.error }
  }
  return { ok: true }
}

/** Statut et journaux bruts d'un déploiement en un seul appel (flux de journaux en direct). */
export async function getDeploymentDetails(
  deploymentId: string,
): Promise<{ status: string; logs: string } | { error: string }> {
  const res = await coolifyFetch<CoolifyDeployment>(`/deployments/${encodeURIComponent(deploymentId)}`)
  if (res.error) return { error: res.error }
  return { status: res.data?.status || 'unknown', logs: res.data?.logs ?? '' }
}

/**
 * Remplace les labels du conteneur.
 *
 * Coolify écrase les `custom_labels` fournis à la création par ses propres
 * labels (entrypoints `http`/`https`, qui n'existent pas dans le Traefik
 * existant). Un PATCH après création est donc nécessaire pour imposer les
 * labels `websecure` du proxy de l'hôte.
 */
export async function setApplicationLabels(
  appId: string,
  labels: string[],
  domains?: readonly string[],
): Promise<{ ok: true } | { error: string }> {
  const payload: Record<string, unknown> = {
    custom_labels: Buffer.from(labels.join('\n'), 'utf8').toString('base64'),
    // Sans ceci, Coolify peut régénérer ses propres labels au déploiement
    // (entrypoints `http`/`https`) et casser le routage TLS de l'hôte.
    is_container_label_readonly_enabled: false,
    is_auto_deploy_enabled: false,
  }
  if (domains && domains.length > 0) {
    payload.domains = domains.map((host) => `https://${host}`).join(',')
  }
  const res = await coolifyFetch(`/applications/${encodeURIComponent(appId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (res.error) return { error: res.error }
  return { ok: true }
}

/**
 * Supprime une application Coolify (et ses conteneurs). Utilisé quand un
 * projet est supprimé depuis le portail : sans cet appel, l'application
 * continuerait de tourner sans plus aucune trace en base.
 */
export async function deleteApplication(
  appId: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await coolifyFetch(`/applications/${encodeURIComponent(appId)}`, {
    method: 'DELETE',
  })
  if (res.error) {
    // Suppression idempotente : une application déjà absente côté Coolify ne
    // doit pas empêcher la suppression de la trace locale.
    if (res.error.includes('Hébergement API 404')) return { ok: true }
    return { error: res.error }
  }
  return { ok: true }
}

/** Ajoute ou met à jour une variable d'environnement d'une application. */export async function setEnvironmentVariable(
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

export interface PersistentStorageSpec {
  /** Nom lisible ; Coolify le préfixe avec l'UUID de l'application. */
  name: string
  /** Chemin absolu dans le conteneur. */
  mountPath: string
}

interface CoolifyStorage {
  uuid?: string
  mount_path?: string
}

/**
 * Crée les stockages persistants manquants d'une application.
 *
 * Endpoint vérifié sur Coolify 4.7.3 (`routes/api.php`) :
 *   GET  /applications/{uuid}/storages
 *   POST /applications/{uuid}/storages { type: 'persistent', name, mount_path }
 *
 * Idempotent : les stockages déjà présents (même `mount_path`) ne sont jamais
 * modifiés ni supprimés. Un échec de lecture est remonté tel quel pour que
 * l'appelant puisse échouer explicitement au lieu de déployer sans volume.
 */
export async function ensureApplicationStorages(
  appId: string,
  storages: readonly PersistentStorageSpec[],
): Promise<{ created: number; existing: number } | { error: string }> {
  if (storages.length === 0) return { created: 0, existing: 0 }

  const basePath = `/applications/${encodeURIComponent(appId)}/storages`
  const listed = await coolifyFetch<{ persistent_storages?: CoolifyStorage[] }>(basePath, {
    signal: AbortSignal.timeout(10_000),
  })
  if (listed.error) {
    return { error: `Stockages de l’application illisibles : ${listed.error}` }
  }

  const existingPaths = new Set(
    (listed.data?.persistent_storages ?? [])
      .map((storage) => storage.mount_path)
      .filter((path): path is string => typeof path === 'string' && path !== ''),
  )

  let created = 0
  let existing = 0
  for (const storage of storages) {
    if (existingPaths.has(storage.mountPath)) {
      existing += 1
      continue
    }
    const res = await coolifyFetch<CoolifyStorage>(basePath, {
      method: 'POST',
      body: JSON.stringify({
        type: 'persistent',
        name: storage.name,
        mount_path: storage.mountPath,
      }),
    })
    if (res.error) {
      // Création concurrente ou stockage déjà enregistré : le volume existe.
      if (res.error.toLowerCase().includes('already')) {
        existing += 1
        continue
      }
      return { error: `Volume « ${storage.mountPath} » non créé : ${res.error}` }
    }
    existingPaths.add(storage.mountPath)
    created += 1
  }

  return { created, existing }
}

/** Liste les applications de l'équipe. */export async function listApplications(
  timeoutMs = 20_000,
): Promise<
  { applications: Array<Record<string, unknown>> } | { error: string }
> {
  const res = await coolifyFetch<Array<Record<string, unknown>>>('/applications', {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.error) return { error: res.error }
  return { applications: res.data ?? [] }
}

export type ManagedDatabaseKind = 'postgresql' | 'redis'

export interface ManagedDatabaseInfo {
  id: string
  status: string
  internalUrl: string
  name: string
}

/** Crée une base PostgreSQL ou Redis privée sur l'infrastructure. */
export async function createManagedDatabase(
  kind: ManagedDatabaseKind,
  name: string,
): Promise<ManagedDatabaseInfo | { error: string }> {
  try {
    const target = await resolveTarget()
    const res = await coolifyFetch<{ uuid?: string; internal_db_url?: string; name?: string }>(
      `/databases/${kind}`,
      {
        method: 'POST',
        body: JSON.stringify({
          server_uuid: target.serverUuid,
          project_uuid: target.projectUuid,
          environment_name: target.environmentName,
          name,
          instant_deploy: true,
        }),
      },
    )
    if (res.error) return { error: res.error }
    const id = res.data?.uuid
    if (!id) return { error: "L'hébergement n'a pas renvoyé l'identifiant de la base." }
    if (res.data?.internal_db_url) {
      return { id, name: res.data.name ?? name, status: 'creating', internalUrl: res.data.internal_db_url }
    }
    const details = await getManagedDatabase(id)
    if ('error' in details) return { error: details.error }
    return { id, name: details.name || name, status: details.status, internalUrl: details.internalUrl }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Création de la base impossible.' }
  }
}

/** Statut et URL interne d'une base managée. */
export async function getManagedDatabase(
  id: string,
  timeoutMs = 5_000,
): Promise<ManagedDatabaseInfo | { error: string }> {
  const res = await coolifyFetch<{
    status?: unknown
    internal_db_url?: unknown
    name?: unknown
  }>(`/databases/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.error) return { error: res.error }
  const data = res.data ?? {}
  return {
    id,
    name: typeof data.name === 'string' ? data.name : id,
    status: typeof data.status === 'string' ? data.status : 'unknown',
    internalUrl: typeof data.internal_db_url === 'string' ? data.internal_db_url : '',
  }
}

/** Supprime une base managée (la suppression Coolify est asynchrone : 200 = mise en file). */
export async function deleteManagedDatabase(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await coolifyFetch(`/databases/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (res.error) {
    if (res.error.includes('Hébergement API 404')) return { ok: true }
    return { error: res.error }
  }
  return { ok: true }
}

/** Démarre, arrête ou redémarre une base managée. */
export async function managedDatabaseAction(
  id: string,
  action: 'start' | 'stop' | 'restart',
): Promise<{ ok: true } | { error: string }> {
  if (!['start', 'stop', 'restart'].includes(action)) return { error: 'Action non prise en charge.' }
  const res = await coolifyFetch(`/databases/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
  })
  if (res.error) return { error: res.error }
  return { ok: true }
}

/** Enregistre une clé privée SSH dans Coolify (pour cloner un dépôt privé). */export async function createPrivateKey(
  privateKey: string,
  name: string,
): Promise<{ id: string } | { error: string }> {
  const res = await coolifyFetch<{ uuid?: string; id?: string }>('/security/keys', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: 'Deploy key Eflex (dépôt privé)',
      private_key: privateKey,
    }),
  })
  if (res.error) return { error: res.error }
  const id = res.data?.uuid ?? res.data?.id
  if (!id) return { error: "L’hébergement n'a pas renvoyé l'identifiant de la clé privée." }
  return { id }
}

/** Supprime une clé privée Coolify (idempotent : 404 = déjà absente). */
export async function deletePrivateKey(uuid: string): Promise<{ ok: boolean } | { error: string }> {
  const res = await coolifyFetch(`/security/keys/${encodeURIComponent(uuid)}`, { method: 'DELETE' })
  if (res.error) {
    if (res.error.includes('Hébergement API 404')) return { ok: true }
    return { error: res.error }
  }
  return { ok: true }
}

export interface ApplicationRuntime {
  /** Statut brut Coolify (`running:healthy`, `exited`, `restarting`…). */
  status: string
  healthCheckEnabled: boolean
  healthCheckPath: string | null
}

/** Statut courant et configuration de healthcheck d'une application. */
export async function getApplicationRuntime(
  appId: string,
  timeoutMs = 5_000,
): Promise<ApplicationRuntime | { error: string }> {
  const res = await coolifyFetch<{
    status?: unknown
    health_check_enabled?: unknown
    health_check_path?: unknown
  }>(`/applications/${encodeURIComponent(appId)}`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.error) return { error: res.error }
  const data = res.data ?? {}
  return {
    status: typeof data.status === 'string' ? data.status : 'unknown',
    healthCheckEnabled: data.health_check_enabled === true,
    healthCheckPath: typeof data.health_check_path === 'string' ? data.health_check_path : null,
  }
}

/** Journaux d'exécution du conteneur (les secrets sont masqués par l'appelant). */
export async function getApplicationLogs(
  appId: string,
  lines = 200,
): Promise<{ logs: string } | { error: string }> {
  const res = await coolifyFetch<{ logs?: unknown }>(
    `/applications/${encodeURIComponent(appId)}/logs?lines=${encodeURIComponent(String(lines))}&show_timestamps=true`,
  )
  if (res.error) return { error: res.error }
  return { logs: typeof res.data?.logs === 'string' ? res.data.logs : '' }
}

export type ApplicationAction = 'start' | 'stop' | 'restart'

/** Démarre, arrête ou redémarre une application Coolify. */
export async function applicationAction(
  appId: string,
  action: ApplicationAction,
): Promise<{ ok: true } | { error: string }> {
  if (!['start', 'stop', 'restart'].includes(action)) {
    return { error: 'Action non prise en charge.' }
  }
  const res = await coolifyFetch(`/applications/${encodeURIComponent(appId)}/${action}`, {
    method: 'POST',
  })
  if (res.error) return { error: res.error }
  return { ok: true }
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
