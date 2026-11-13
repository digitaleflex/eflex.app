/**
 * Entrées de la palette de commandes (⌘K) : fabrication et filtrage, sans React ni réseau,
 * pour pouvoir les tester. Le composant associe `icon` à un pictogramme.
 */

export type PaletteIcon =
  | 'plus'
  | 'projects'
  | 'activity'
  | 'team'
  | 'invite'
  | 'notifications'
  | 'theme'
  | 'project'
  | 'redeploy'
  | 'logs'
  | 'domain'

export type PaletteItem = {
  id: string
  label: string
  hint?: string
  href?: string
  action?: 'theme' | 'redeploy'
  group: 'Actions' | 'Projets'
  icon: PaletteIcon
  projectId?: string
  projectName?: string
}

export type PaletteProject = {
  id: string
  name: string
  domain: string | null
  apps?: { id: string; name?: string; position: number; domain?: string | null }[]
}

export const PALETTE_ACTIONS: readonly PaletteItem[] = [
  { id: 'new', label: 'Nouveau projet', hint: 'Importer un dépôt GitHub', href: '/dashboard/new', group: 'Actions', icon: 'plus' },
  { id: 'projects', label: 'Projets', href: '/dashboard', group: 'Actions', icon: 'projects' },
  { id: 'activity', label: 'Activité', hint: 'Tous les déploiements', href: '/dashboard/activity', group: 'Actions', icon: 'activity' },
  { id: 'team', label: 'Équipe', hint: 'Membres et invitations', href: '/dashboard/organization', group: 'Actions', icon: 'team' },
  { id: 'invite', label: 'Inviter un membre', hint: 'Depuis la page Équipe', href: '/dashboard/organization', group: 'Actions', icon: 'invite' },
  { id: 'notifications', label: 'Notifications', hint: 'Et préférences', href: '/dashboard/notifications', group: 'Actions', icon: 'notifications' },
  { id: 'theme', label: 'Changer de thème', hint: 'Clair / sombre', action: 'theme', group: 'Actions', icon: 'theme' },
]

/** Domaine de l'application principale (position la plus basse, puis nom, puis id), sinon celui du projet. */
function primaryDomain(project: PaletteProject): string | null {
  const primary = project.apps
    ?.slice()
    .sort((a, b) => a.position - b.position || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))[0]
  return primary?.domain ?? project.domain ?? null
}

/**
 * Une entrée de navigation par projet ; les actions (redéployer, journaux, domaine)
 * seulement si l'utilisateur peut gérer les projets.
 */
export function buildProjectItems(projects: readonly PaletteProject[], canManage: boolean): PaletteItem[] {
  const items: PaletteItem[] = []
  for (const p of projects) {
    items.push({
      id: `project:${p.id}`,
      label: p.name,
      hint: primaryDomain(p) ?? undefined,
      href: `/dashboard/projects/${p.id}`,
      group: 'Projets',
      icon: 'project',
    })
    if (!canManage) continue
    items.push({
      id: `project:${p.id}:redeploy`,
      label: `Redéployer ${p.name}`,
      hint: p.name,
      action: 'redeploy',
      group: 'Projets',
      icon: 'redeploy',
      projectId: p.id,
      projectName: p.name,
    })
    items.push({
      id: `project:${p.id}:logs`,
      label: `Voir les journaux de ${p.name}`,
      hint: p.name,
      href: `/dashboard/projects/${p.id}?tab=deployments`,
      group: 'Projets',
      icon: 'logs',
    })
    items.push({
      id: `project:${p.id}:domain`,
      label: `Ajouter un domaine à ${p.name}`,
      hint: p.name,
      href: `/dashboard/projects/${p.id}/settings#domaines`,
      group: 'Projets',
      icon: 'domain',
    })
  }
  return items
}

export const PALETTE_EMPTY_QUERY_PROJECT_LIMIT = 12

/**
 * Filtre insensible à la casse (libellé, indice, nom du projet). Sans requête : les 12 premières
 * entrées de projets puis toutes les actions ; avec requête : projets d'abord, puis actions.
 */
export function filterPaletteItems(
  query: string,
  projectItems: readonly PaletteItem[],
  actions: readonly PaletteItem[] = PALETTE_ACTIONS,
): PaletteItem[] {
  const q = query.trim().toLowerCase()
  const match = (item: PaletteItem) =>
    !q ||
    item.label.toLowerCase().includes(q) ||
    (item.hint ?? '').toLowerCase().includes(q) ||
    (item.projectName ?? '').toLowerCase().includes(q)
  const matchedProjects = projectItems.filter(match)
  const matchedActions = actions.filter(match)
  return q
    ? [...matchedProjects, ...matchedActions]
    : [...matchedProjects.slice(0, PALETTE_EMPTY_QUERY_PROJECT_LIMIT), ...matchedActions]
}
