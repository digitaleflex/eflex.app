/**
 * Filtres, recherche et tri de l'explorateur de projets.
 *
 * Fonctions pures, sans dépendance : elles sont utilisées par le composant
 * client et testées directement (aucun indicateur n'est calculé ailleurs).
 */
import { frameworkLabel } from '@/lib/frameworks'
import { attentionRank, statusInfo } from '@/lib/project-status'

export type ExplorerProjectApp = {
  id?: string
  framework?: string | null
  domain?: string | null
  name?: string | null
  position?: number
}

/** Champs strictement nécessaires pour filtrer/trier ; `DashboardProject` les fournit. */
export type ExplorerProject = {
  id: string
  name: string
  /** Miroir projet (compatibilité) ; l'app principale prévaut quand `apps` est fourni. */
  domain: string | null
  repoUrl: string
  /** Miroir projet (compatibilité) ; l'app principale prévaut quand `apps` est fourni. */
  framework: string | null
  lastStatus: string | null
  lastAt: string | null
  updatedAt: string
  /** Applications du projet : source de vérité pour domaine/framework. */
  apps?: readonly ExplorerProjectApp[]
}

export type ProjectFilter = 'all' | 'live' | 'active' | 'failed'
export type ProjectSort = 'recent' | 'status' | 'name'

export type ProjectFilterDefinition = {
  id: ProjectFilter
  label: string
  test: (project: ExplorerProject) => boolean
}

/** Filtres proposés dans la barre d'outils, dans l'ordre d'affichage. */
export const PROJECT_FILTERS: readonly ProjectFilterDefinition[] = [
  { id: 'all', label: 'Tous', test: () => true },
  { id: 'live', label: 'En ligne', test: (project) => project.lastStatus === 'live' },
  { id: 'active', label: 'En cours', test: (project) => statusInfo(project.lastStatus).inProgress },
  { id: 'failed', label: 'En échec', test: (project) => statusInfo(project.lastStatus).tone === 'danger' },
]

/** Explication courte du tri, affichée sous les outils. */
export const PROJECT_SORT_HINTS: Record<ProjectSort, string> = {
  recent: 'Triés par activité récente.',
  status: 'Projets en échec puis en cours d’abord.',
  name: 'Triés par nom, de A à Z.',
}

const SORT_LABELS: Record<ProjectSort, string> = {
  recent: 'Activité récente',
  status: 'À regarder d’abord',
  name: 'Nom (A → Z)',
}

export const PROJECT_SORTS: readonly { id: ProjectSort; label: string }[] = [
  { id: 'recent', label: SORT_LABELS.recent },
  { id: 'status', label: SORT_LABELS.status },
  { id: 'name', label: SORT_LABELS.name },
]

/** Nombre de projets par filtre (les compteurs restent cohérents avec le filtre courant). */
export function projectFilterCounts(projects: readonly ExplorerProject[]): Record<ProjectFilter, number> {
  const counts = {} as Record<ProjectFilter, number>
  for (const filter of PROJECT_FILTERS) counts[filter.id] = projects.filter(filter.test).length
  return counts
}

function primaryAppOf(apps: readonly ExplorerProjectApp[] | undefined): ExplorerProjectApp | null {
  if (!apps || apps.length === 0) return null
  return (
    [...apps].sort(
      (a, b) =>
        (a.position ?? 0) - (b.position ?? 0) ||
        (a.name ?? '').localeCompare(b.name ?? '') ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    )[0] ?? null
  )
}

function matchesQuery(project: ExplorerProject, query: string): boolean {
  if (query === '') return true
  const primary = primaryAppOf(project.apps)
  const primaryDomain = primary?.domain ?? project.domain ?? ''
  const primaryFramework = primary?.framework ?? project.framework ?? ''
  const values = [project.name, primaryDomain, project.repoUrl, primaryFramework ? frameworkLabel(primaryFramework) : '', primaryFramework]
  for (const app of project.apps ?? []) {
    if (app.domain) values.push(app.domain)
    if (app.framework) {
      values.push(app.framework, frameworkLabel(app.framework))
    }
  }
  return values.some((value) => value.toLowerCase().includes(query))
}

function byName(a: ExplorerProject, b: ExplorerProject): number {
  return a.name.localeCompare(b.name, 'fr')
}

/**
 * Applique recherche, filtre et tri sans modifier le tableau d'entrée.
 * Le tri « à regarder d'abord » place les échecs, puis les déploiements en
 * cours, puis le reste ; le tri récent compare la dernière activité connue.
 */
export function selectProjects<T extends ExplorerProject>(
  projects: readonly T[],
  options: { query?: string; filter?: ProjectFilter; sort?: ProjectSort },
): T[] {
  const query = (options.query ?? '').trim().toLowerCase()
  const filter = PROJECT_FILTERS.find((entry) => entry.id === (options.filter ?? 'all')) ?? PROJECT_FILTERS[0]!
  const sort = options.sort ?? 'recent'

  return projects
    .filter((project) => filter.test(project) && matchesQuery(project, query))
    .slice()
    .sort((a, b) => {
      if (sort === 'name') return byName(a, b)
      if (sort === 'status') return attentionRank(a.lastStatus) - attentionRank(b.lastStatus) || byName(a, b)
      return (b.lastAt ?? b.updatedAt).localeCompare(a.lastAt ?? a.updatedAt) || byName(a, b)
    })
}
