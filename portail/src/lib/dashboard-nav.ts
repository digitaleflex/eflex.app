/**
 * Navigation de la console : source unique des destinations et de l'état actif.
 * Module pur (aucun import React) pour rester testable sans DOM.
 */

export type DashboardTabKey = 'projects' | 'activity' | 'usage' | 'team' | 'notifications' | 'settings'

export interface DashboardTab {
  key: DashboardTabKey
  label: string
  href: string
}

/** Ordre de lecture commun au bureau et au téléphone. */
export const DASHBOARD_TABS: readonly DashboardTab[] = [
  { key: 'projects', label: 'Projets', href: '/dashboard' },
  { key: 'activity', label: 'Activité', href: '/dashboard/activity' },
  { key: 'usage', label: 'Utilisation', href: '/dashboard/usage' },
  { key: 'team', label: 'Équipe', href: '/dashboard/organization' },
  { key: 'settings', label: 'Paramètres', href: '/dashboard/settings' },
]

/** Retire l'éventuelle requête, l'ancre et la barre oblique finale. */
function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? ''
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Vrai pour la section elle-même et ses sous-pages, jamais pour un préfixe voisin. */
function inSection(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`)
}

/**
 * Section active de la console, ou `null` hors des destinations connues.
 * « Projets » couvre la liste, la création et le détail d'un projet.
 */
export function activeDashboardTab(pathname: string): DashboardTabKey | null {
  const path = normalizePath(pathname)

  if (path === '/dashboard' || path === '/dashboard/new') return 'projects'
  if (inSection(path, '/dashboard/projects')) return 'projects'
  if (inSection(path, '/dashboard/activity')) return 'activity'
  if (inSection(path, '/dashboard/usage')) return 'usage'
  if (inSection(path, '/dashboard/organization')) return 'team'
  if (inSection(path, '/dashboard/notifications')) return 'notifications'
  if (inSection(path, '/dashboard/settings')) return 'settings'

  return null
}
