/**
 * Inventaire et lecture des variables d'environnement Vercel (MIG-1, MIG-2) :
 * accès ponctuels via un jeton fourni par l'utilisateur.
 *
 * Sécurité (issue #148) :
 * - le jeton est un paramètre en mémoire, utilisé uniquement pour l'appel en cours ;
 * - il n'est jamais écrit en base, jamais retourné, et aucune valeur sensible ne
 *   doit être consignée (les messages d'erreur sont génériques côté fournisseur) ;
 * - aucune valeur n'est devinée : si une variable n'est pas relisible de façon sûre,
 *   elle est signalée comme « à ressaisir » sans exposer de contenu.
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

export type VercelMigrationErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'upstream'
  | 'network'
  | 'not_found'

export class VercelMigrationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: VercelMigrationErrorCode,
  ) {
    super(message)
    this.name = 'VercelMigrationError'
  }
}

/** @deprecated Utiliser `VercelMigrationError` (MIG-2). Conservé pour compatibilité des imports. */
export type VercelInventoryErrorCode = VercelMigrationErrorCode
/** @deprecated Utiliser `VercelMigrationError` (MIG-2). Conservé pour compatibilité des imports. */
export const VercelInventoryError = VercelMigrationError
export type VercelInventoryError = VercelMigrationError

const GENERAL_LIMITATIONS = [
  'Le jeton Vercel est utilisé une seule fois pour cet inventaire : il n\'est ni enregistré, ni consigné.',
  'Les variables d\'environnement ne sont pas importées automatiquement. Vous pouvez en préparer la revue pour un projet sélectionné : seules les valeurs réellement lisibles sont proposées masquées, les valeurs sensibles ou non relisibles doivent être ressaisies.',
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

function vercelError(status: number, context: 'projects' | 'env'): VercelMigrationError {
  if (status === 401) {
    return new VercelMigrationError(
      'Jeton Vercel refusé. Vérifiez qu\'il est valide et non expiré.',
      401,
      'unauthorized',
    )
  }
  if (status === 403) {
    return new VercelMigrationError(
      context === 'env'
        ? 'Accès refusé par Vercel. Le jeton n\'a peut-être pas les droits nécessaires pour lire les variables d\'environnement.'
        : 'Accès refusé par Vercel. Le jeton n\'a peut-être pas les droits nécessaires pour lire les projets.',
      403,
      'forbidden',
    )
  }
  if (status === 404 && context === 'env') {
    return new VercelMigrationError(
      'Projet Vercel introuvable ou inaccessible avec ce jeton.',
      404,
      'not_found',
    )
  }
  if (status === 429) {
    return new VercelMigrationError(
      'Vercel a temporairement limité les demandes. Réessayez dans quelques instants.',
      429,
      'rate_limited',
    )
  }
  if (context === 'env') {
    return new VercelMigrationError(
      'Impossible de lire les variables d\'environnement Vercel pour le moment. Réessayez plus tard.',
      502,
      'upstream',
    )
  }
  return new VercelMigrationError(
    'Impossible de lire les projets Vercel pour le moment. Réessayez plus tard.',
    502,
    'upstream',
  )
}

async function fetchJson(
  url: URL,
  token: string,
  context: 'projects' | 'env',
): Promise<unknown> {
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

    if (!response.ok) {
      throw vercelError(response.status, context)
    }

    return (await response.json()) as unknown
  } catch (error) {
    if (error instanceof VercelMigrationError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new VercelMigrationError(
        context === 'env'
          ? 'La lecture des variables d\'environnement Vercel a pris trop de temps. Réessayez.'
          : 'La lecture des projets Vercel a pris trop de temps. Réessayez.',
        504,
        'network',
      )
    }
    throw new VercelMigrationError(
      'Impossible de contacter Vercel. Vérifiez votre connexion et réessayez.',
      502,
      'network',
    )
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPage(token: string, until: number | null): Promise<unknown> {
  const url = new URL('/v10/projects', VERCEL_API)
  url.searchParams.set('limit', String(PAGE_LIMIT))
  if (until !== null) url.searchParams.set('until', String(until))
  return fetchJson(url, token, 'projects')
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

export type VercelEnvTarget = 'production' | 'preview' | 'development'

export interface VercelEnvVar {
  key: string
  targets: VercelEnvTarget[]
  /** Valeur lisible uniquement si l'API Vercel l'a fournie de façon exploitable ; sinon absente. */
  value?: string
  /** Vrai si la valeur peut être pré-remplie (présente et non marquée comme secret sensible non relisible). */
  readable: boolean
  /** Vrai si la variable doit être ressaisie manuellement (valeur non relisible, sensible ou absente). */
  requiresReentry: boolean
  /** Type déclaré par Vercel (`plain`, `encrypted`, `secret`, `sensitive`, `system`, etc.), si connu. */
  vercelType?: string
  /** Contexte déclaratif (branche de prévisualisation, configuration), sans valeur. */
  note?: string
  /** Raisons factuelles expliquant pourquoi la valeur doit être ressaisie, le cas échéant. */
  reasons: string[]
}

export interface VercelEnvOverlap {
  key: string
  /** Environnement concerné par plusieurs définitions de la même clé. */
  target: VercelEnvTarget
  /** Nombre de définitions qui s'appliquent à cette cible. */
  count: number
}

export interface VercelEnvReview {
  projectId: string
  /** Variables regroupées par clé et ensemble de cibles (une entrée par combinaison distincte). */
  variables: VercelEnvVar[]
  /** Doublons/chevauchements : même clé déclarée plusieurs fois pour une même cible. */
  overlaps: VercelEnvOverlap[]
  /** Avertissements généraux (rien d'inventé sur les besoins métier). */
  warnings: string[]
  /** Rappels de limites : aucune valeur devinée, saisie manuelle requise si non relisible. */
  limitations: string[]
  /** Compteurs factuels pour l'instrumentation (sans secret). */
  stats: {
    total: number
    readable: number
    requiresReentry: number
    overlaps: number
  }
  /** Vrai si la liste renvoyée par Vercel a été tronquée. */
  truncated: boolean
}

const ENV_PAGE_LIMIT = 100
const MAX_ENV_ITEMS = 500

const ENV_LIMITATIONS = [
  'Le jeton Vercel est utilisé une seule fois pour cette lecture : il n\'est ni enregistré, ni consigné.',
  'Les variables marquées « sensible » ou « secret » ne sont pas relisibles sur Vercel : ressaisissez-les vous-même. Aucune valeur n\'est devinée.',
  'Les valeurs réellement lisibles sont pré-remplies et masquées ; vérifiez-les avant l\'import. Les variables propres à l\'environnement Vercel (système, branches de prévisualisation spécifiques) peuvent demander une adaptation.',
]

const TARGET_ORDER: VercelEnvTarget[] = ['development', 'preview', 'production']

function normalizeTargets(value: unknown): VercelEnvTarget[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const set = new Set<VercelEnvTarget>()
  for (const item of items) {
    if (item === 'production' || item === 'preview' || item === 'development') set.add(item)
  }
  return TARGET_ORDER.filter((target) => set.has(target))
}

function extractEnvItems(payload: unknown): { items: unknown[]; next: number | null } {
  if (Array.isArray(payload)) return { items: payload, next: null }
  if (!isRecord(payload)) return { items: [], next: null }
  const envs = Array.isArray(payload.envs)
    ? payload.envs
    : Array.isArray(payload.environmentVariables)
      ? payload.environmentVariables
      : []
  let next: number | null = null
  if (isRecord(payload.pagination)) {
    const rawNext = payload.pagination.next
    if (typeof rawNext === 'number' && Number.isFinite(rawNext)) next = rawNext
    else if (typeof rawNext === 'string' && rawNext.trim() !== '') {
      const parsed = Number(rawNext)
      if (Number.isFinite(parsed)) next = parsed
    }
  }
  return { items: envs, next }
}

interface NormalizedEnvItem {
  key: string
  targets: VercelEnvTarget[]
  value?: string
  readable: boolean
  requiresReentry: boolean
  vercelType?: string
  note?: string
  reasons: string[]
}

function normalizeEnvItem(raw: unknown): NormalizedEnvItem | null {
  if (!isRecord(raw)) return null
  const key = asTrimmedString(raw.key)
  if (!key) return null
  const targets = normalizeTargets(raw.target)
  const vercelType = asTrimmedString(raw.type)
  const gitBranch = asTrimmedString(raw.gitBranch)
  const note = gitBranch ? `Branche de prévisualisation : ${gitBranch}` : undefined

  const reasons: string[] = []
  const typeLower = vercelType?.toLowerCase()
  const sensitiveType = typeLower === 'sensitive' || typeLower === 'secret'

  let value: string | undefined
  let readable = false
  let requiresReentry = false

  if (sensitiveType) {
    requiresReentry = true
    reasons.push(
      typeLower === 'sensitive'
        ? 'Variable marquée sensible sur Vercel : la valeur n\'est pas relisible.'
        : 'Variable secrète sur Vercel : la valeur n\'est pas relisible.',
    )
  } else if (typeof raw.value === 'string') {
    // Valeur fournie par l'API : considérée lisible uniquement si non vide de sens caché.
    // On ne devine rien ; la valeur est pré-remplie telle quelle et sera masquée dans l'interface.
    value = raw.value
    readable = true
  } else {
    requiresReentry = true
    reasons.push('Valeur non fournie par Vercel : ressaisie nécessaire.')
  }

  if (!requiresReentry && typeLower === 'system') {
    reasons.push('Variable système Vercel : vérifiez qu\'elle est pertinente hors de Vercel.')
  }

  if (targets.length === 0) {
    reasons.push('Aucune cible standard (Development/Preview/Production) déclarée : vérifiez la portée.')
  }

  return { key, targets, value, readable, requiresReentry, vercelType, note, reasons }
}

function targetsKey(targets: VercelEnvTarget[]): string {
  return targets.join(',')
}

export async function fetchVercelProjectEnv(
  token: string,
  projectId: string,
  requestedTargets?: VercelEnvTarget[],
): Promise<VercelEnvReview> {
  const targetFilter =
    requestedTargets && requestedTargets.length > 0 ? new Set(requestedTargets) : null

  const collected: NormalizedEnvItem[] = []
  let cursor: number | null = null
  let truncated = false

  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`/v10/projects/${encodeURIComponent(projectId)}/env`, VERCEL_API)
    url.searchParams.set('limit', String(ENV_PAGE_LIMIT))
    if (cursor !== null) url.searchParams.set('until', String(cursor))
    const payload = await fetchJson(url, token, 'env')
    const { items, next } = extractEnvItems(payload)

    for (const item of items) {
      const normalized = normalizeEnvItem(item)
      if (!normalized) continue
      if (targetFilter) {
        const filteredTargets = normalized.targets.filter((target) => targetFilter.has(target))
        if (filteredTargets.length === 0) continue
        normalized.targets = filteredTargets
      }
      collected.push(normalized)
      if (collected.length >= MAX_ENV_ITEMS) {
        truncated = true
        break
      }
    }

    if (truncated) break
    if (next === null || items.length === 0) break
    cursor = next
  }

  // Regroupement par clé + combinaison de cibles pour présenter une ligne par définition distincte,
  // et détection des chevauchements (même clé appliquée plusieurs fois à une même cible).
  const byKeyTargets = new Map<string, NormalizedEnvItem & { count: number }>()
  const targetCounts = new Map<string, Map<VercelEnvTarget, number>>()

  for (const item of collected) {
    const groupKey = `${item.key}\u0000${targetsKey(item.targets)}\u0000${item.note ?? ''}`
    const existing = byKeyTargets.get(groupKey)
    if (existing) {
      existing.count += 1
      if (!existing.readable && item.readable && item.value !== undefined) {
        existing.readable = true
        existing.requiresReentry = false
        existing.value = item.value
        existing.reasons = existing.reasons.filter((r) => !r.includes('non fournie'))
      }
      existing.reasons = [...new Set([...existing.reasons, ...item.reasons])]
    } else {
      byKeyTargets.set(groupKey, { ...item, reasons: [...item.reasons], count: 1 })
    }

    let perTarget = targetCounts.get(item.key)
    if (!perTarget) {
      perTarget = new Map()
      targetCounts.set(item.key, perTarget)
    }
    for (const target of item.targets.length > 0 ? item.targets : (['production'] as VercelEnvTarget[])) {
      perTarget.set(target, (perTarget.get(target) ?? 0) + 1)
    }
  }

  const variables = [...byKeyTargets.values()]
    .map((item) => {
      const reasons = [...item.reasons]
      if (item.count > 1) {
        reasons.push(`Définie ${item.count} fois pour la même combinaison de cibles : vérifiez la valeur retenue.`)
      }
      return {
        key: item.key,
        targets: item.targets,
        ...(item.readable && item.value !== undefined ? { value: item.value } : {}),
        readable: item.readable && item.value !== undefined,
        requiresReentry: item.requiresReentry || !(item.readable && item.value !== undefined),
        ...(item.vercelType ? { vercelType: item.vercelType } : {}),
        ...(item.note ? { note: item.note } : {}),
        reasons: [...new Set(reasons)],
      } satisfies VercelEnvVar
    })
    .sort((a, b) => a.key.localeCompare(b.key) || targetsKey(a.targets).localeCompare(targetsKey(b.targets)))

  const overlaps: VercelEnvOverlap[] = []
  for (const [key, perTarget] of targetCounts) {
    for (const target of TARGET_ORDER) {
      const count = perTarget.get(target) ?? 0
      if (count > 1) overlaps.push({ key, target, count })
    }
  }
  overlaps.sort((a, b) => a.key.localeCompare(b.key) || a.target.localeCompare(b.target))

  const warnings: string[] = []
  if (overlaps.length > 0) {
    warnings.push(
      'Certaines clés sont définies plusieurs fois pour un même environnement : vérifiez quelle valeur doit s\'appliquer.',
    )
  }
  const hasTargetless = variables.some((v) => v.targets.length === 0)
  if (hasTargetless) {
    warnings.push('Certaines variables n\'ont pas de cible standard déclarée : leur portée doit être vérifiée.')
  }
  if (variables.some((v) => v.vercelType?.toLowerCase() === 'system')) {
    warnings.push('Des variables système Vercel ont été détectées : elles peuvent ne pas être nécessaires hors de Vercel.')
  }
  if (variables.length === 0) {
    warnings.push('Aucune variable d\'environnement trouvée pour ce projet (ou pour les environnements demandés).')
  }

  const readableCount = variables.filter((v) => v.readable).length
  const requiresReentryCount = variables.filter((v) => v.requiresReentry).length

  return {
    projectId,
    variables,
    overlaps,
    warnings,
    limitations: ENV_LIMITATIONS,
    stats: {
      total: variables.length,
      readable: readableCount,
      requiresReentry: requiresReentryCount,
      overlaps: overlaps.length,
    },
    truncated,
  }
}
