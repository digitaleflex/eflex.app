/**
 * Lecture d'un fichier du dépôt au moment du déploiement.
 *
 * Sert à valider le compose fourni par l'utilisateur juste avant de demander à
 * Coolify de le déployer : Coolify relit ce fichier dans le dépôt, le portail
 * doit donc inspecter la même source, pas un contenu mis en cache à l'analyse.
 *
 * Dépôt public : `raw.githubusercontent.com` (aucun jeton).
 * Dépôt privé : API Contents avec le jeton d'installation GitHub App ou le PAT
 * du propriétaire du projet, comme l'analyse. Le jeton n'est jamais journalisé.
 */
import { parseGitHubUrl } from '@/lib/github-url'
import { resolveProjectToken } from '@/lib/git-credentials'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/')

function safePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized === '' || normalized.length > 300) return null
  if (normalized.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')) {
    return null
  }
  return normalized
}

export interface RepositoryFileRequest {
  repoUrl: string
  branch: string
  repoPrivate: boolean
  userId: string
  installationId: string | null
  /** Chemin relatif à la racine du dépôt. */
  path: string
  fetchImpl?: typeof fetch
}

export async function fetchRepositoryFile(
  request: RepositoryFileRequest,
): Promise<{ content: string } | { error: string }> {
  const ref = parseGitHubUrl(request.repoUrl)
  if (!ref) return { error: 'Le dépôt GitHub du projet est invalide.' }

  const path = safePath(request.path)
  if (!path) return { error: 'Le chemin du fichier à lire est invalide.' }

  const doFetch = request.fetchImpl ?? fetch
  const token = request.repoPrivate
    ? await resolveProjectToken({ userId: request.userId, installationId: request.installationId })
    : null

  if (request.repoPrivate && !token) {
    return {
      error:
        'Ce dépôt est privé : reconnectez la GitHub App ou enregistrez un jeton personnel pour lire le fichier compose.',
    }
  }

  const url = token
    ? `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(request.branch)}`
    : `https://raw.githubusercontent.com/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${request.branch.split('/').map(encodeURIComponent).join('/')}/${encodePath(path)}`

  const headers: Record<string, string> = token
    ? {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'eflex-portail',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    : { 'User-Agent': 'eflex-portail' }

  let response: Response
  try {
    response = await doFetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { error: 'Impossible de joindre GitHub pour lire le fichier compose.' }
  }

  if (response.status === 404) {
    return {
      error: `Fichier compose introuvable dans le dépôt (branche « ${request.branch} », chemin « ${path} »).`,
    }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      error:
        'GitHub a refusé la lecture du fichier compose : vérifiez les droits de la GitHub App ou du jeton personnel.',
    }
  }
  if (!response.ok) {
    return { error: `Lecture du fichier compose impossible (GitHub ${response.status}).` }
  }

  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
    return { error: 'Le fichier compose dépasse la taille maximale autorisée (2 Mio).' }
  }

  const content = await response.text()
  if (content.length > MAX_FILE_BYTES) {
    return { error: 'Le fichier compose dépasse la taille maximale autorisée (2 Mio).' }
  }
  if (content.trim() === '') return { error: 'Le fichier compose du dépôt est vide.' }

  return { content }
}
