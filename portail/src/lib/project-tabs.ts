/** Contrat des onglets de la page projet (compat URL `?tab=`). */

export const PROJECT_TABS = [
  { id: 'overview', label: "Vue d'ensemble", short: 'Aperçu' },
  { id: 'deployments', label: 'Déploiements', short: 'Déploiements' },
  { id: 'variables', label: 'Variables', short: 'Variables' },
  { id: 'logs', label: 'Logs', short: 'Logs' },
] as const

export type ProjectTab = (typeof PROJECT_TABS)[number]['id']

const PROJECT_TAB_IDS = new Set<string>(PROJECT_TABS.map((tab) => tab.id))

/** Résout l'onglet demandé : valeur invalide ou absente => `overview`. */
export function resolveProjectTab(value: string | null | undefined): ProjectTab {
  return value && PROJECT_TAB_IDS.has(value) ? (value as ProjectTab) : 'overview'
}

/** URL canonique de l'onglet (`overview` sans paramètre `?tab`). */
export function projectTabHref(projectId: string, tab: ProjectTab): string {
  return `/dashboard/projects/${projectId}${tab === 'overview' ? '' : `?tab=${tab}`}`
}
