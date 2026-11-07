// Analyse d'URL de dépôt GitHub. Fonctions pures, sans dépendance : elles servent de
// garde-fou avant tout appel réseau (les composants d'URL sont réutilisés tels quels
// pour construire les requêtes vers api.github.com et raw.githubusercontent.com).

export interface GitHubRepoRef {
  owner: string
  repo: string
  /** Branche lue dans l'URL (`/tree/<branche>`), sinon null. */
  branch: string | null
}

// Alphanumérique ou tirets simples ; ni début ni fin par un tiret (règle des noms GitHub).
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,200}$/

/** Nom de branche acceptable : reprend les interdits de `git check-ref-format` qui comptent ici. */
export function isValidBranch(name: string): boolean {
  if (!BRANCH_RE.test(name)) return false
  if (name.startsWith('/') || name.startsWith('-') || name.endsWith('/') || name.endsWith('.')) return false
  if (name.includes('..') || name.includes('//') || name.includes('/.') || name.endsWith('.lock')) return false
  return true
}

function validRepo(owner: string, repo: string): boolean {
  return OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== '.' && repo !== '..'
}

export function canonicalRepoUrl(ref: Pick<GitHubRepoRef, 'owner' | 'repo'>): string {
  return `https://github.com/${ref.owner}/${ref.repo}`
}

/**
 * Accepte `https://github.com/owner/repo`, avec ou sans `.git`, barre finale, `www.`,
 * `/tree/<branche>[/chemin]`, ou la forme SSH `git@github.com:owner/repo.git`.
 * Retourne null pour tout autre hôte ou toute URL mal formée.
 */
export function parseGitHubUrl(input: string): GitHubRepoRef | null {
  const raw = input.trim()
  if (raw === '' || raw.length > 300) return null

  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(raw)
  if (ssh) {
    const [, owner, repo] = ssh
    return owner && repo && validRepo(owner, repo) ? { owner, repo, branch: null } : null
  }

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null
  if (url.username || url.password || url.port) return null

  const parts = url.pathname.split('/').filter(Boolean)
  const owner = parts[0]
  const repoPart = parts[1]
  if (!owner || !repoPart) return null

  const repo = repoPart.replace(/\.git$/, '')
  if (!validRepo(owner, repo)) return null

  // `/tree/<branche>/...` : seul le premier segment est retenu (un nom de branche avec
  // des « / » est ambigu dans une URL). Le champ « Branche » du formulaire fait foi.
  let branch: string | null = null
  if (parts[2] === 'tree' && parts[3]) {
    try {
      const candidate = decodeURIComponent(parts[3])
      branch = isValidBranch(candidate) ? candidate : null
    } catch {
      branch = null
    }
  }

  return { owner, repo, branch }
}
