/**
 * Client GitHub App (issue 07). Aucune dépendance : JWT RS256 via `node:crypto`
 * et appels REST via `fetch`.
 *
 * - `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` (PEM, `\n` échappés acceptés)
 *   servent à obtenir un jeton d'installation courte durée.
 * - `GITHUB_WEBHOOK_SECRET` vérifie `X-Hub-Signature-256`.
 * - `GITHUB_APP_SLUG` construit l'URL d'installation.
 */
import { createHmac, createSign, timingSafeEqual } from 'node:crypto'

const API = 'https://api.github.com'
const UA = 'eflex-portail'

export interface GitHubRepoSummary {
  id: number
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  url: string
}

function appConfig(): { appId: string; privateKey: string } {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!appId || !privateKey) {
    throw new Error('GitHub App non configurée : GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY sont requis.')
  }
  return { appId, privateKey }
}

/** JWT d'application (valable 9 minutes, `iat` décalé de 60 s pour l'horloge). */
export function githubAppJwt(): string {
  const { appId, privateKey } = appConfig()
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString('base64url')
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(privateKey)
    .toString('base64url')
  return `${header}.${payload}.${signature}`
}

function headers(jwt: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${jwt}`,
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
    headers: headers(githubAppJwt()),
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
): Promise<string | null> {
  const res = await fetchImpl(`${API}/app/installations/${installationId}`, {
    headers: headers(githubAppJwt()),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { account?: { login?: string } }
  return body.account?.login ?? 'inconnu'
}

/** Dépôts accessibles à une installation (max 100, triés par nom). */
export async function listInstallationRepositories(
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubRepoSummary[]> {
  const token = await getInstallationToken(installationId, fetchImpl)
  const res = await fetchImpl(`${API}/installation/repositories?per_page=100`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': UA,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Liste des dépôts indisponible (HTTP ${res.status}).`)
  const body = (await res.json()) as {
    repositories?: Array<{
      id?: number
      name?: string
      full_name?: string
      private?: boolean
      default_branch?: string
      html_url?: string
    }>
  }
  return (body.repositories ?? [])
    .filter((r) => typeof r.id === 'number' && typeof r.full_name === 'string')
    .map((r) => ({
      id: r.id as number,
      name: r.name ?? (r.full_name as string).split('/').pop() ?? '',
      fullName: r.full_name as string,
      private: r.private === true,
      defaultBranch: r.default_branch ?? 'main',
      url: r.html_url ?? `https://github.com/${r.full_name}`,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** URL d'installation de l'App, ou `null` si le slug n'est pas configuré. */
export function installationUrl(): string | null {
  const slug = process.env.GITHUB_APP_SLUG
  return slug ? `https://github.com/apps/${slug}/installations/new` : null
}

/** Signature `X-Hub-Signature-256`, comparée en temps constant. */
export function verifyGitHubWebhook(body: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const provided = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
}
