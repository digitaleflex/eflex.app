/**
 * Inventaire Vercel (MIG-1) : lecture ponctuelle des projets accessibles via un jeton
 * fourni par l'utilisateur.
 *
 * Sécurité (issue #148) :
 * - le jeton est un paramètre en mémoire, utilisé uniquement pour cet appel ;
 * - il n'est jamais écrit en base, jamais retourné, et aucune valeur sensible ne
 *   doit être consignée (les messages d'erreur sont génériques côté fournisseur) ;
 * - aucune variable d'environnement Vercel n'est lue (les secrets ne sont ni
 *   déchiffrés ni devinés) : seules les métadonnées de projet sont inventoriées.
 */

const VERCEL_API = 'https://api.vercel.com'
const PAGE_LIMIT = 100
const MAX_PROJECTS = 200
const FETCH_TIMEOUT_MS = 12_000

export interface VercelInventoryRepo {
  /** `github`, `gitlab`, `bitbucket` ou absent si le projet n'est pas lié à Git. */
  provider?: string
  /** Propriétaire/organisation côté fournisseur Git, si connu. */
  org?: string
  /** Nom du dépôt côté fournisseur Git, si connu. */
  repo?: string
  /** URL du dépôt GitHub, uniquement quand le lien est vérifiable comme GitHub. */
  gitHubUrl?: string
  /** Branche de production déclarée côté Vercel, si connue. */
  productionBranch?: string
}

export interface VercelInventoryProject {
  id: string
  name: string
  framework?: string
  buildCommand?: string | null
  installCommand?: string | null
  devCommand?: string | null
  outputDirectory?: string | null
  rootDirectory?: string | null
  repository: VercelInventoryRepo | null
  /** Points à vérifier manuellement, déduits des métadonnées exposées par l'API. */
  warnings: string[]
}

export interface VercelInventory {
  projects: VercelInventoryProject[]
  /** Vrai si la liste a été tronquée pour rester bornée (tous les projets ne sont pas affichés). */
  truncated: boolean
  /** Rappels de limites : rien n'est importé automatiquement dans cet inventaire. */
  limitations: string[]
}

export type VercelInventoryErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'upstream'
  | 'network'

export class VercelInventoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: VercelInventoryErrorCode,
  ) {
    super(message)
    this.name = 'VercelInventoryError'
  }
}

const GENERAL_LIMITATIONS = [
  'Le jeton Vercel est utilisé une seule fois pour cet inventaire : il n\'est ni enregistré, ni consigné.',
  'Aucune variable d\'environnement n\'est importée. Les valeurs sensibles ne sont pas relisibles sur Vercel : vous devrez les ressaisir vous-même.',
  'Les domaines personnalisés et les bases de données ne sont pas migrés automatiquement ; des étapes manuelles restent nécessaires.',
  'Les fonctions propres à Vercel (Edge Functions, Middleware, Cron Jobs, ISR, configuration `vercel.json`, etc.) ne sont pas importées et doivent être vérifiées.',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  return value
}

function repoFromLink(link: unknown): VercelInventoryRepo | null {
  if (!isRecord(link)) return null
  const type = asTrimmedString(link.type)
  const org = asTrimmedString(link.org)
  const repo = asTrimmedString(link.repo)
  const productionBranch = asTrimmedString(link.productionBranch)
  if (!type && !org && !repo && !productionBranch) return null

  const info: VercelInventoryRepo = {}
  if (type) info.provider = type
  if (org) info.org = org
  if (repo) info.repo = repo
  if (productionBranch) info.productionBranch = productionBranch
  if (type === 'github' && org && repo) {
    info.gitHubUrl = `https://github.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}`
  }
  return info
}

function projectWarnings(project: VercelInventoryProject): string[] {
  const warnings: string[] = []
  if (!project.repository) {
    warnings.push('Aucun dépôt Git lié : import du code impossible sans dépôt accessible.')
  } else if (!project.repository.gitHubUrl) {
    warnings.push(
      `Dépôt ${project.repository.provider ?? 'Git'} lié : Eflex importe aujourd'hui depuis GitHub ; une adaptation manuelle du dépôt peut être nécessaire.`,
    )
  }
  if (project.rootDirectory) {
    warnings.push('Le projet utilise un dossier racine personnalisé : vérifiez le dossier d\'application lors de l\'import.')
  }
  if (project.buildCommand || project.installCommand || project.outputDirectory) {
    warnings.push('Des commandes ou un dossier de sortie personnalisés sont définis : à vérifier après import.')
  }
  return warnings
}

function toProject(raw: unknown): VercelInventoryProject | null {
  if (!isRecord(raw)) return null
  const id = asTrimmedString(raw.id)
  const name = asTrimmedString(raw.name)
  if (!id || !name) return null

  const repository = repoFromLink(raw.link)
  const project: VercelInventoryProject = {
    id,
    name,
    repository,
    warnings: [],
  }

  const framework = asTrimmedString(raw.framework)
  if (framework) project.framework = framework

  const buildCommand = asNullableString(raw.buildCommand)
  if (buildCommand !== undefined) project.buildCommand = buildCommand
  const installCommand = asNullableString(raw.installCommand)
  if (installCommand !== undefined) project.installCommand = installCommand
  const devCommand = asNullableString(raw.devCommand)
  if (devCommand !== undefined) project.devCommand = devCommand
  const outputDirectory = asNullableString(raw.outputDirectory)
  if (outputDirectory !== undefined) project.outputDirectory = outputDirectory
  const rootDirectory = asNullableString(raw.rootDirectory)
  if (rootDirectory !== undefined) project.rootDirectory = rootDirectory

  project.warnings = projectWarnings(project)
  return project
}

function extractProjectsPage(payload: unknown): { items: unknown[]; next: number | null } {
  if (Array.isArray(payload)) {
    return { items: payload, next: null }
  }
  if (isRecord(payload)) {
    const projects = Array.isArray(payload.projects) ? payload.projects : []
    let next: number | null = null
    if (isRecord(payload.pagination)) {
      const rawNext = payload.pagination.next
      if (typeof rawNext === 'number' && Number.isFinite(rawNext)) next = rawNext
      else if (typeof rawNext === 'string' && rawNext.trim() !== '') {
        const parsed = Number(rawNext)
        if (Number.isFinite(parsed)) next = parsed
      }
    }
    return { items: projects, next }
  }
  return { items: [], next: null }
}

async function fetchPage(token: string, until: number | null): Promise<unknown> {
  const url = new URL('/v10/projects', VERCEL_API)
  url.searchParams.set('limit', String(PAGE_LIMIT))
  if (until !== null) url.searchParams.set('until', String(until))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (response.status === 401) {
      throw new VercelInventoryError(
        'Jeton Vercel refusé. Vérifiez qu\'il est valide et non expiré.',
        401,
        'unauthorized',
      )
    }
    if (response.status === 403) {
      throw new VercelInventoryError(
        'Accès refusé par Vercel. Le jeton n\'a peut-être pas les droits nécessaires pour lire les projets.',
        403,
        'forbidden',
      )
    }
    if (response.status === 429) {
      throw new VercelInventoryError(
        'Vercel a temporairement limité les demandes. Réessayez dans quelques instants.',
        429,
        'rate_limited',
      )
    }
    if (!response.ok) {
      throw new VercelInventoryError(
        'Impossible de lire les projets Vercel pour le moment. Réessayez plus tard.',
        502,
        'upstream',
      )
    }

    return (await response.json()) as unknown
  } catch (error) {
    if (error instanceof VercelInventoryError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new VercelInventoryError(
        'La lecture des projets Vercel a pris trop de temps. Réessayez.',
        504,
        'network',
      )
    }
    throw new VercelInventoryError(
      'Impossible de contacter Vercel. Vérifiez votre connexion et réessayez.',
      502,
      'network',
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Liste les projets Vercel accessibles avec le jeton fourni (lecture seule).
 * Le jeton n'est ni conservé ni journalisé par cette fonction.
 */
export async function fetchVercelInventory(token: string): Promise<VercelInventory> {
  const projects: VercelInventoryProject[] = []
  const seen = new Set<string>()
  let cursor: number | null = null
  let truncated = false

  for (let page = 0; page < 20; page += 1) {
    const payload = await fetchPage(token, cursor)
    const { items, next } = extractProjectsPage(payload)

    for (const item of items) {
      const project = toProject(item)
      if (!project || seen.has(project.id)) continue
      seen.add(project.id)
      projects.push(project)
      if (projects.length >= MAX_PROJECTS) {
        truncated = true
        break
      }
    }

    if (truncated) break
    if (next === null || items.length === 0) break
    cursor = next
  }

  return {
    projects,
    truncated,
    limitations: GENERAL_LIMITATIONS,
  }
}
