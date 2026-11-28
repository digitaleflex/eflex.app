/** Contrat des onglets de la page projet (compat URL `?tab=`). */

export const PROJECT_TABS = [
  { id: 'overview', label: "Vue d'ensemble", short: 'Aperçu' },
  { id: 'deployments', label: 'Déploiements', short: 'Déploiements' },
  { id: 'logs', label: 'Logs', short: 'Logs' },
  { id: 'variables', label: 'Variables', short: 'Variables' },
  { id: 'previews', label: 'Prévisualisations', short: 'Préviews' },
  { id: 'tasks', label: 'Tâches planifiées', short: 'Tâches' },
  { id: 'analytics', label: 'Analytique', short: 'Analytique' },
] as const

export type ProjectTab = (typeof PROJECT_TABS)[number]['id']

/** Onglets principaux, affichés en premier dans la navigation. */
export const PROJECT_MAIN_TABS = PROJECT_TABS.filter(
  (tab): tab is (typeof PROJECT_TABS)[number] & { id: 'overview' | 'deployments' | 'logs' | 'variables' } =>
    ['overview', 'deployments', 'logs', 'variables'].includes(tab.id),
)

/** Onglets avancés, regroupés sous une entrée dédiée. */
export const PROJECT_ADVANCED_TABS = PROJECT_TABS.filter(
  (tab): tab is (typeof PROJECT_TABS)[number] & { id: 'previews' | 'tasks' | 'analytics' } =>
    ['previews', 'tasks', 'analytics'].includes(tab.id),
)

const PROJECT_TAB_IDS = new Set<string>(PROJECT_TABS.map((tab) => tab.id))
const PROJECT_ADVANCED_TAB_IDS = new Set<string>(PROJECT_ADVANCED_TABS.map((tab) => tab.id))

export function isProjectAdvancedTab(tab: ProjectTab): boolean {
  return PROJECT_ADVANCED_TAB_IDS.has(tab)
}

/** Résout l'onglet demandé : valeur invalide ou absente => `overview`. */
export function resolveProjectTab(value: string | null | undefined): ProjectTab {
  return value && PROJECT_TAB_IDS.has(value) ? (value as ProjectTab) : 'overview'
}

/** URL canonique de l'onglet (`overview` sans paramètre `?tab`). */
export function projectTabHref(projectId: string, tab: ProjectTab): string {
  return `/dashboard/projects/${projectId}${tab === 'overview' ? '' : `?tab=${tab}`}`
}
