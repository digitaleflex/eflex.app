/**
 * Client GitHub App. Aucune dépendance : JWT RS256 via `node:crypto` et appels REST via `fetch`.
 *
 * Configuration : variable d'environnement (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
 * `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`) ou, à défaut, réglages chiffrés en base
 * (`PlatformSetting`) écrits par le flux manifest de l'admin.
 */
import { createHmac, createSign, timingSafeEqual } from 'node:crypto'
import { decrypt, encrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'

const API = 'https://api.github.com'
const UA = 'eflex-portail'

/** Cookie de corrélation du flux d'installation (state). */
export const GITHUB_INSTALL_STATE_COOKIE = 'eflex-gh-install-state'
/** Cookies du flux d'autorisation utilisateur (vérification de propriété). */
export const GITHUB_OAUTH_STATE_COOKIE = 'eflex-gh-oauth-state'
export const GITHUB_OAUTH_INSTALL_COOKIE = 'eflex-gh-oauth-install'

export const GITHUB_SETTING_KEYS = {
  appId: 'github.app.id',
  slug: 'github.app.slug',
  privateKey: 'github.app.privateKey',
  webhookSecret: 'github.app.webhookSecret',
  clientId: 'github.app.clientId',
  clientSecret: 'github.app.clientSecret',
} as const

const SENSITIVE_SETTINGS = new Set<string>([
  GITHUB_SETTING_KEYS.privateKey,
  GITHUB_SETTING_KEYS.webhookSecret,
  GITHUB_SETTING_KEYS.clientSecret,
])

export interface GitHubRepoSummary {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  url: string
  updatedAt: string | null
}

export interface GitHubAppConfig {
  appId: string
  privateKey: string
  slug: string | null
  webhookSecret: string | null
  clientId: string | null
  clientSecret: string | null
}

function settingAad(key: string): string {
  return `github-app:${key}`
}

function envConfig(): GitHubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID?.trim()
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!appId || !privateKey) return null
  return {
    appId,
    privateKey,
    slug: process.env.GITHUB_APP_SLUG?.trim() || null,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim() || null,
    clientId: process.env.GITHUB_APP_CLIENT_ID?.trim() || null,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET?.trim() || null,
  }
}

/** Lit la configuration (env prioritaire, sinon base). `null` si l'App n'est pas configurée. */
export async function getAppConfig(): Promise<GitHubAppConfig | null> {
  const fromEnv = envConfig()
  if (fromEnv) return fromEnv

  let rows: { key: string; value: string }[]
  try {
    rows = await prisma.platformSetting.findMany({
      where: { key: { in: Object.values(GITHUB_SETTING_KEYS) } },
      select: { key: true, value: true },
    })
  } catch {
    // Base indisponible : on se comporte comme une App non configurée.
    return null
  }

  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const read = (key: string): string | null => {
    const value = stored.get(key)
    if (!value) return null
    try {
      return SENSITIVE_SETTINGS.has(key) ? decrypt(value, settingAad(key)) : value
    } catch {
      return null
    }
  }

  const appId = read(GITHUB_SETTING_KEYS.appId)
  const privateKey = read(GITHUB_SETTING_KEYS.privateKey)
  if (!appId || !privateKey) return null
  return {
    appId,
    privateKey,
    slug: read(GITHUB_SETTING_KEYS.slug),
    webhookSecret: read(GITHUB_SETTING_KEYS.webhookSecret),
    clientId: read(GITHUB_SETTING_KEYS.clientId),
    clientSecret: read(GITHUB_SETTING_KEYS.clientSecret),
  }
}

async function requireAppConfig(): Promise<GitHubAppConfig> {
  const config = await getAppConfig()
  if (!config) {
    throw new Error('GitHub App non configurée : GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY sont requis.')
  }
  return config
}

/** Enregistre les identifiants renvoyés par GitHub (flux manifest), chiffrés au repos. */
export async function saveAppConfig(input: {
  appId: string
  slug: string
  privateKey: string
  webhookSecret: string
  clientId: string
  clientSecret: string
}): Promise<void> {
  const rows: { key: string; value: string }[] = [
    { key: GITHUB_SETTING_KEYS.appId, value: input.appId },
    { key: GITHUB_SETTING_KEYS.slug, value: input.slug },
    { key: GITHUB_SETTING_KEYS.privateKey, value: encrypt(input.privateKey, settingAad(GITHUB_SETTING_KEYS.privateKey)) },
    { key: GITHUB_SETTING_KEYS.webhookSecret, value: encrypt(input.webhookSecret, settingAad(GITHUB_SETTING_KEYS.webhookSecret)) },
    { key: GITHUB_SETTING_KEYS.clientId, value: input.clientId },
    { key: GITHUB_SETTING_KEYS.clientSecret, value: encrypt(input.clientSecret, settingAad(GITHUB_SETTING_KEYS.clientSecret)) },
  ]
  await prisma.$transaction(
    rows.map((row) =>
      prisma.platformSetting.upsert({
        where: { key: row.key },
        create: row,
        update: { value: row.value },
      }),
    ),
  )
}

/** Clé de vérification des webhooks : base/DB, ou variable d'environnement historique. */
export async function getWebhookSecret(): Promise<string> {
  const config = await getAppConfig()
  return config?.webhookSecret ?? process.env.GITHUB_WEBHOOK_SECRET?.trim() ?? ''
}

/** JWT d'application (valable 9 minutes, `iat` décalé de 60 s pour l'horloge). */
export async function githubAppJwt(): Promise<string> {
  const { appId, privateKey } = await requireAppConfig()
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString('base64url')
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(privateKey)
    .toString('base64url')
  return `${header}.${payload}.${signature}`
}

function appHeaders(jwt: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${jwt}`,
    'User-Agent': UA,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function tokenHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': UA,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Jeton d'installation (1 h), utilisable sur les dépôts privés autorisés. */
export async function getInstallationToken(
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!/^\d+$/.test(installationId)) throw new Error('Identifiant d’installation GitHub invalide.')
  const res = await fetchImpl(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: appHeaders(await githubAppJwt()),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`GitHub a refusé le jeton d’installation (HTTP ${res.status}).`)
  const body = (await res.json()) as { token?: string }
  if (!body.token) throw new Error('Réponse GitHub incomplète (jeton absent).')
  return body.token
}

/** Vérifie que l'installation existe bien pour cette App (anti-usurpation). */
export async function installationExists(
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ login: string; createdAt: Date | null } | null> {
  const res = await fetchImpl(`${API}/app/installations/${installationId}`, {
    headers: appHeaders(await githubAppJwt()),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { account?: { login?: string }; created_at?: string }
  const createdAt = body.created_at ? new Date(body.created_at) : null
  return { login: body.account?.login ?? 'inconnu', createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null }
}

function mapRepositories(body: unknown): GitHubRepoSummary[] {
  const repositories =
    typeof body === 'object' && body !== null && Array.isArray((body as { repositories?: unknown }).repositories)
      ? ((body as { repositories: unknown[] }).repositories as unknown[])
      : []
  return repositories
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .filter((r) => typeof r.id === 'number' && typeof r.full_name === 'string')
    .map((r) => ({
      id: r.id as number,
      name: (r.name as string | undefined) ?? (r.full_name as string).split('/').pop() ?? '',
      fullName: r.full_name as string,
      private: r.private === true,
      defaultBranch: (r.default_branch as string | undefined) ?? 'main',
      url: (r.html_url as string | undefined) ?? `https://github.com/${r.full_name as string}`,
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** Dépôts accessibles à une installation (pagination bornée à 5 pages). */
export async function listInstallationRepositories(
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubRepoSummary[]> {
  const token = await getInstallationToken(installationId, fetchImpl)
  const all: GitHubRepoSummary[] = []
  for (let page = 1; page <= 5; page += 1) {
    const res = await fetchImpl(`${API}/installation/repositories?per_page=100&page=${page}`, {
      headers: tokenHeaders(token),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Liste des dépôts indisponible (HTTP ${res.status}).`)
    const batch = mapRepositories(await res.json())
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all.sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/**
 * Dépôts visibles par un PAT (comptes personnels et organisations dont l'utilisateur
 * est membre). Pagination bornée à 5 pages pour rester rapide.
 */
export async function listUserRepositories(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubRepoSummary[]> {
  const all: GitHubRepoSummary[] = []
  for (let page = 1; page <= 5; page += 1) {
    const res = await fetchImpl(
      `${API}/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers: tokenHeaders(token), signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) throw new Error(`Liste des dépôts indisponible (HTTP ${res.status}).`)
    const body = (await res.json()) as unknown
    const batch = mapRepositories({ repositories: Array.isArray(body) ? body : [] })
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all.sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** Identité et portées d'un jeton personnel (aucun droit requis pour lire /user). */
export async function fetchUserForToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ login: string; scopes: string | null }> {
  const res = await fetchImpl(`${API}/user`, {
    headers: tokenHeaders(token),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error('Jeton GitHub invalide ou expiré.')
  const body = (await res.json()) as { login?: string }
  if (!body.login) throw new Error('Réponse GitHub incomplète.')
  return { login: body.login, scopes: res.headers?.get?.('x-oauth-scopes') ?? null }
}

/** Ajoute une deploy key en lecture seule à un dépôt (permission administration). */
export async function createDeployKey(
  token: string,
  owner: string,
  repo: string,
  publicKey: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const res = await fetchImpl(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys`, {
    method: 'POST',
    headers: { ...tokenHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, key: publicKey, read_only: true }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const detail = res.status === 403 || res.status === 404 ? ' (droit « Administration » requis sur le dépôt)' : ''
    throw new Error(`Ajout de la deploy key GitHub impossible (HTTP ${res.status})${detail}.`)
  }
  const body = (await res.json()) as { id?: number }
  if (typeof body.id !== 'number') throw new Error('Réponse GitHub incomplète (deploy key).')
  return body.id
}

/** Supprime une deploy key (idempotent : 404 = déjà absente). */
export async function deleteDeployKey(
  token: string,
  owner: string,
  repo: string,
  keyId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/keys/${keyId}`,
    { method: 'DELETE', headers: tokenHeaders(token), signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok && res.status !== 404) {
    throw new Error(`Suppression de la deploy key GitHub impossible (HTTP ${res.status}).`)
  }
}

/** Échange le `code` du flux manifest contre les identifiants de l'App. */
export async function exchangeManifestCode(code: string): Promise<{
  id: number
  slug: string
  pem: string
  webhookSecret: string
  clientId: string
  clientSecret: string
}> {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`GitHub a refusé la création de l’application (HTTP ${res.status}).`)
  const body = (await res.json()) as {
    id?: number
    slug?: string
    pem?: string
    webhook_secret?: string
    client_id?: string
    client_secret?: string
  }
  if (!body.id || !body.slug || !body.pem) throw new Error('Réponse GitHub incomplète (application).')
  return {
    id: body.id,
    slug: body.slug,
    pem: body.pem,
    webhookSecret: body.webhook_secret ?? '',
    clientId: body.client_id ?? '',
    clientSecret: body.client_secret ?? '',
  }
}

/** URL d'installation de l'App, ou `null` si le slug n'est pas configuré. */
export async function installationUrl(): Promise<string | null> {
  const slug = (await getAppConfig())?.slug
  return slug ? `https://github.com/apps/${slug}/installations/new` : null
}

/** Identifiants OAuth de l'App (nécessaires pour vérifier la propriété d'une installation). */
export async function getOAuthConfig(): Promise<{ clientId: string; clientSecret: string } | null> {
  const config = await getAppConfig()
  if (!config?.clientId || !config.clientSecret) return null
  return { clientId: config.clientId, clientSecret: config.clientSecret }
}

/** Échange le code OAuth utilisateur contre un jeton d'accès utilisateur. */
export async function exchangeUserCode(
  code: string,
  redirectUri: string,
): Promise<string> {
  const oauth = await getOAuthConfig()
  if (!oauth) throw new Error('Identifiants OAuth GitHub App absents.')
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`GitHub a refusé l’autorisation (HTTP ${res.status}).`)
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('GitHub n’a pas renvoyé de jeton utilisateur.')
  return body.access_token
}

/** Installations GitHub accessibles au jeton utilisateur (preuve de propriété). */
export async function listUserInstallations(
  userToken: string,
): Promise<{ installationId: string; accountLogin: string }[]> {
  const res = await fetch(`${API}/user/installations?per_page=100`, {
    headers: tokenHeaders(userToken),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Installations GitHub indisponibles (HTTP ${res.status}).`)
  const body = (await res.json()) as {
    installations?: Array<{ id?: number; account?: { login?: string } }>
  }
  return (body.installations ?? [])
    .filter((item): item is { id: number; account?: { login?: string } } => typeof item.id === 'number')
    .map((item) => ({ installationId: String(item.id), accountLogin: item.account?.login ?? 'inconnu' }))
}

/** Signature `X-Hub-Signature-256`, comparée en temps constant. */
export function verifyGitHubWebhook(body: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const provided = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
}
