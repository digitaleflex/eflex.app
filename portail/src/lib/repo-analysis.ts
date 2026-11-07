// Analyse d'un dépôt GitHub public : récupère l'arborescence et les fichiers utiles,
// puis délègue la décision au détecteur déterministe (@eflex/detector).
//
// Le détecteur est synchrone et sans I/O : on le relance en boucle. À chaque tour on note
// les fichiers qu'il a demandés sans les avoir, on les télécharge, et on recommence jusqu'à
// ce qu'il n'en demande plus. Le résultat final est donc celui que donnerait le dépôt complet.
//
// Sécurité :
//  - seuls api.github.com et raw.githubusercontent.com sont contactés, avec des composants
//    d'URL déjà validés (github-url.ts) ;
//  - les dépôts privés sont refusés : le jeton GITHUB_TOKEN sert uniquement à relever la
//    limite de requêtes et ne doit jamais ouvrir l'accès aux dépôts de son propriétaire ;
//  - le jeton n'est envoyé qu'à api.github.com, jamais à raw.githubusercontent.com ;
//  - la lecture est bornée (nombre de fichiers, taille, délais).

import { detect, detectApplication, isIgnoredPath } from '@eflex/detector'
import type { DetectionResult, RepoSnapshot } from '@eflex/detector'
import { canonicalRepoUrl, type GitHubRepoRef } from '@/lib/github-url'

export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AnalysisError'
  }
}

export interface AnalysisLimits {
  /** Fichiers pris en compte dans l'arborescence. */
  maxFiles: number
  /** Taille maximale d'un fichier lu, en octets. */
  maxFileBytes: number
  /** Nombre maximal de fichiers téléchargés pour une analyse. */
  maxFilesRead: number
  /** Nombre maximal de tours détection → téléchargement. */
  maxRounds: number
  requestTimeoutMs: number
  totalTimeoutMs: number
  concurrency: number
}

export const DEFAULT_LIMITS: AnalysisLimits = {
  maxFiles: 50_000,
  maxFileBytes: 512 * 1024,
  maxFilesRead: 150,
  maxRounds: 6,
  requestTimeoutMs: 10_000,
  totalTimeoutMs: 30_000,
  concurrency: 8,
}

export interface AnalysisOptions {
  /** Sous-dossier choisi par l'utilisateur dans un monorepo. */
  root?: string
  /** Commit à analyser (sinon : tête de la branche). */
  commitSha?: string
  /** Jeton GitHub optionnel, uniquement pour relever la limite de requêtes. */
  token?: string
  fetchImpl?: typeof fetch
  limits?: Partial<AnalysisLimits>
}

export interface RepoAnalysis {
  repo: {
    owner: string
    repo: string
    url: string
    branch: string
    defaultBranch: string
    commitSha: string
  }
  detection: DetectionResult
  /** Vrai si l'analyse a pu rester partielle (dépôt énorme, fichiers illisibles…). */
  incomplete: boolean
}

const SHA_RE = /^[0-9a-f]{40}$/

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/')

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function analyzeGitHubRepo(
  ref: Pick<GitHubRepoRef, 'owner' | 'repo' | 'branch'>,
  options: AnalysisOptions = {},
): Promise<RepoAnalysis> {
  const limits: AnalysisLimits = { ...DEFAULT_LIMITS, ...options.limits }
  const doFetch = options.fetchImpl ?? fetch
  const deadline = Date.now() + limits.totalTimeoutMs
  const { owner, repo } = ref
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  async function request(url: string, headers: Record<string, string>): Promise<Response> {
    try {
      return await doFetch(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(limits.requestTimeoutMs),
      })
    } catch {
      throw new AnalysisError('Impossible de joindre GitHub. Réessayez dans un instant.', 502)
    }
  }

  async function api(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'eflex-portail',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (options.token) headers.Authorization = `Bearer ${options.token}`
    const res = await request(`https://api.github.com${path}`, headers)
    throwIfRateLimited(res)
    return res
  }

  function throwIfRateLimited(res: Response): void {
    if (res.status !== 403 && res.status !== 429) return
    if (res.headers.get('x-ratelimit-remaining') !== '0' && !res.headers.get('retry-after')) return
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const minutes = Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : null
    throw new AnalysisError(
      `Limite de requêtes GitHub atteinte. Réessayez ${minutes ? `dans environ ${minutes} minute${minutes > 1 ? 's' : ''}` : 'un peu plus tard'}.`,
      429,
    )
  }

  async function json(res: Response): Promise<unknown> {
    try {
      return await res.json()
    } catch {
      throw new AnalysisError('Réponse inattendue de GitHub. Réessayez dans un instant.', 502)
    }
  }

  // 1. Le dépôt : existence, visibilité, branche par défaut.
  const metaRes = await api(repoPath)
  if (metaRes.status === 404) {
    throw new AnalysisError(
      "Dépôt introuvable. Vérifiez l'adresse : pour l'instant, seuls les dépôts publics sont pris en charge.",
      404,
    )
  }
  if (!metaRes.ok) throw new AnalysisError("GitHub n'a pas pu répondre. Réessayez dans un instant.", 502)

  const meta = await json(metaRes)
  if (!isRecord(meta) || typeof meta.default_branch !== 'string' || typeof meta.private !== 'boolean') {
    throw new AnalysisError('Réponse inattendue de GitHub. Réessayez dans un instant.', 502)
  }
  if (meta.private) {
    throw new AnalysisError('Ce dépôt est privé. Pour l\'instant, seuls les dépôts publics sont pris en charge.', 422)
  }

  const defaultBranch = meta.default_branch
  const branch = ref.branch ?? defaultBranch

  // 2. Le commit analysé : fixé une fois pour toutes, afin que l'arborescence et le contenu
  //    des fichiers proviennent du même état du dépôt.
  let commitSha = options.commitSha
  if (commitSha !== undefined && !SHA_RE.test(commitSha)) {
    throw new AnalysisError('Identifiant de commit invalide.', 400)
  }
  if (!commitSha) {
    const refRes = await api(`${repoPath}/git/ref/heads/${encodePath(branch)}`)
    if (refRes.status === 404 || refRes.status === 409) {
      throw new AnalysisError(`Branche « ${branch} » introuvable (le dépôt est peut-être vide).`, 404)
    }
    if (!refRes.ok) throw new AnalysisError("GitHub n'a pas pu répondre. Réessayez dans un instant.", 502)
    const body = await json(refRes)
    const sha = isRecord(body) && isRecord(body.object) ? body.object.sha : undefined
    if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
      throw new AnalysisError('Réponse inattendue de GitHub. Réessayez dans un instant.', 502)
    }
    commitSha = sha
  }

  // 3. L'arborescence complète.
  const treeRes = await api(`${repoPath}/git/trees/${commitSha}?recursive=1`)
  if (treeRes.status === 404 || treeRes.status === 422) {
    throw new AnalysisError("Impossible de lire l'arborescence du dépôt.", 404)
  }
  if (treeRes.status === 409) throw new AnalysisError('Ce dépôt est vide.', 422)
  if (!treeRes.ok) throw new AnalysisError("GitHub n'a pas pu répondre. Réessayez dans un instant.", 502)

  const treeBody = await json(treeRes)
  if (!isRecord(treeBody) || !Array.isArray(treeBody.tree)) {
    throw new AnalysisError('Réponse inattendue de GitHub. Réessayez dans un instant.', 502)
  }

  const blobs = new Map<string, number>() // chemin -> taille en octets
  let incomplete = treeBody.truncated === true
  for (const entry of treeBody.tree as unknown[]) {
    if (!isRecord(entry) || entry.type !== 'blob' || typeof entry.path !== 'string') continue
    const path = entry.path
    if (path.split('/').some((segment) => segment === '..' || segment === '.')) continue
    if (isIgnoredPath(path)) continue
    if (blobs.size >= limits.maxFiles) {
      incomplete = true
      break
    }
    blobs.set(path, typeof entry.size === 'number' ? entry.size : 0)
  }
  if (blobs.size === 0) throw new AnalysisError('Ce dépôt ne contient aucun fichier analysable.', 422)

  // 4. Détection, en boucle, avec téléchargement à la demande des fichiers lus.
  const files = [...blobs.keys()]
  const cache = new Map<string, string | null>()
  let unreadable = 0

  async function fetchOne(path: string): Promise<void> {
    if ((blobs.get(path) ?? 0) > limits.maxFileBytes) {
      cache.set(path, null)
      return
    }
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/${encodePath(path)}`
    try {
      // Pas de jeton ici : le contenu brut d'un dépôt public est anonyme.
      const res = await request(url, { 'User-Agent': 'eflex-portail' })
      if (res.status === 404) {
        cache.set(path, null)
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const text = await res.text()
      cache.set(path, text.length > limits.maxFileBytes ? null : text)
    } catch {
      unreadable += 1
      cache.set(path, null)
    }
  }

  async function fetchMany(paths: string[]): Promise<void> {
    const queue = [...paths]
    const workers = Array.from({ length: Math.min(limits.concurrency, queue.length) }, async () => {
      for (let path = queue.shift(); path !== undefined; path = queue.shift()) await fetchOne(path)
    })
    await Promise.all(workers)
  }

  const root = options.root?.trim() ?? ''
  let detection: DetectionResult
  for (let round = 1; ; round += 1) {
    const missing = new Set<string>()
    const snapshot: RepoSnapshot = {
      files,
      read: (path) => {
        if (cache.has(path)) return cache.get(path) ?? null
        if (blobs.has(path)) missing.add(path)
        return null
      },
    }

    detection = root === '' ? detect(snapshot) : detectApplication(snapshot, root)
    if (missing.size === 0) break

    if (round >= limits.maxRounds || cache.size + missing.size > limits.maxFilesRead || Date.now() > deadline) {
      incomplete = true
      break
    }
    await fetchMany([...missing])
  }

  const warnings = [...detection.warnings]
  if (incomplete) {
    warnings.push("Ce dépôt est très volumineux : l'analyse peut être incomplète. Un fichier `eflex.json` à la racine permet de fixer la configuration.")
  }
  if (unreadable > 0) {
    warnings.push("Certains fichiers n'ont pas pu être lus : l'analyse peut être incomplète. Relancez-la si le résultat vous semble étrange.")
  }

  return {
    repo: {
      owner,
      repo,
      url: canonicalRepoUrl({ owner, repo }),
      branch,
      defaultBranch,
      commitSha,
    },
    detection: { ...detection, warnings: unique(warnings) },
    incomplete: incomplete || unreadable > 0,
  }
}
