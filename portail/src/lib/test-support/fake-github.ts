import { createHash } from 'node:crypto'

// Faux GitHub pour les tests : reproduit les trois routes de api.github.com utilisées par
// l'analyse (dépôt, référence, arborescence) et raw.githubusercontent.com (contenu).

export interface FakeRepo {
  files: Record<string, string>
  private?: boolean
  defaultBranch?: string
  /** Branches existantes (par défaut : seulement la branche par défaut). */
  branches?: string[]
  /** Simule une arborescence tronquée par GitHub. */
  truncated?: boolean
  /** Remplace la taille déclarée de certains fichiers. */
  sizes?: Record<string, number>
  /** Chemins ajoutés tels quels à l'arborescence (même s'ils sont absents de `files`). */
  extraTreePaths?: string[]
}

export interface FakeCall {
  url: string
  host: string
  headers: Record<string, string>
}

export const fakeSha = (key: string): string => createHash('sha1').update(key).digest('hex')

export function fakeGitHub(
  repos: Record<string, FakeRepo>,
  options: { rateLimited?: boolean; failHost?: string } = {},
) {
  const calls: FakeCall[] = []

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
    calls.push({ url: url.href, host: url.host, headers })

    if (options.failHost === url.host) throw new TypeError('fetch failed')

    if (url.host === 'api.github.com') {
      if (options.rateLimited) {
        const reset = Math.floor(Date.now() / 1000) + 12 * 60
        return json({ message: 'API rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        })
      }

      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent) // repos, o, r, ...
      const key = `${parts[1]}/${parts[2]}`
      const repo = repos[key]
      if (parts[0] !== 'repos' || !repo) return json({ message: 'Not Found' }, 404)

      const defaultBranch = repo.defaultBranch ?? 'main'
      if (parts.length === 3) {
        return json({ full_name: key, private: repo.private ?? false, default_branch: defaultBranch })
      }

      if (parts[3] === 'git' && parts[4] === 'ref' && parts[5] === 'heads') {
        const branch = parts.slice(6).join('/')
        const exists = (repo.branches ?? [defaultBranch]).includes(branch)
        return exists ? json({ ref: `refs/heads/${branch}`, object: { type: 'commit', sha: fakeSha(`${key}@${branch}`) } }) : json({ message: 'Not Found' }, 404)
      }

      // API Contents utilisée pour les dépôts privés (jeton d'installation).
      if (parts[3] === 'contents') {
        const path = parts.slice(4).join('/')
        const content = repo.files[path]
        return content === undefined
          ? new Response('404: Not Found', { status: 404 })
          : new Response(content, { status: 200 })
      }

      if (parts[3] === 'git' && parts[4] === 'trees') {
        const paths = [...Object.keys(repo.files), ...(repo.extraTreePaths ?? [])]
        return json({
          sha: parts[5],
          truncated: repo.truncated ?? false,
          tree: [
            ...paths.map((path) => ({
              path,
              mode: '100644',
              type: 'blob',
              sha: fakeSha(path),
              size: repo.sizes?.[path] ?? (repo.files[path]?.length ?? 0),
            })),
            { path: 'src', mode: '040000', type: 'tree', sha: fakeSha('src') },
          ],
        })
      }
      return json({ message: 'Not Found' }, 404)
    }

    if (url.host === 'raw.githubusercontent.com') {
      const [owner, name, , ...rest] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const repo = repos[`${owner}/${name}`]
      const content = repo?.files[rest.join('/')]
      return content === undefined ? new Response('404: Not Found', { status: 404 }) : new Response(content, { status: 200 })
    }

    throw new Error(`Hôte inattendu dans le test : ${url.host}`)
  }) as typeof fetch

  return { fetch: fetchImpl, calls }
}
