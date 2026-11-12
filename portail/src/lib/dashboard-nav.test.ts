import { describe, expect, it } from 'vitest'
import { activeDashboardTab, DASHBOARD_TABS } from '@/lib/dashboard-nav'

describe('activeDashboardTab', () => {
  it('reconnaît chaque destination principale', () => {
    expect(activeDashboardTab('/dashboard')).toBe('projects')
    expect(activeDashboardTab('/dashboard/activity')).toBe('activity')
    expect(activeDashboardTab('/dashboard/usage')).toBe('usage')
    expect(activeDashboardTab('/dashboard/organization')).toBe('team')
    expect(activeDashboardTab('/dashboard/notifications')).toBe('notifications')
    expect(activeDashboardTab('/dashboard/settings')).toBe('settings')
  })

  it('garde « Projets » actif pour la création et le détail d’un projet', () => {
    expect(activeDashboardTab('/dashboard/new')).toBe('projects')
    expect(activeDashboardTab('/dashboard/projects')).toBe('projects')
    expect(activeDashboardTab('/dashboard/projects/abc-123')).toBe('projects')
    expect(activeDashboardTab('/dashboard/projects/abc-123/settings')).toBe('projects')
  })

  it('accepte une barre oblique finale, une requête ou une ancre', () => {
    expect(activeDashboardTab('/dashboard/activity/')).toBe('activity')
    expect(activeDashboardTab('/dashboard/settings/?onglet=securite')).toBe('settings')
    expect(activeDashboardTab('/dashboard/notifications#preferences')).toBe('notifications')
  })

  it('ne confond pas un préfixe voisin avec une section', () => {
    expect(activeDashboardTab('/dashboard/activity-old')).toBeNull()
    expect(activeDashboardTab('/dashboard/settingsfoo')).toBeNull()
    expect(activeDashboardTab('/dashboard/projects-archive')).toBeNull()
  })

  it('ne renvoie rien hors de la console', () => {
    expect(activeDashboardTab('/')).toBeNull()
    expect(activeDashboardTab('/status')).toBeNull()
    expect(activeDashboardTab('/dashboard/inconnu')).toBeNull()
    expect(activeDashboardTab('')).toBeNull()
  })
})

describe('DASHBOARD_TABS', () => {
  it('conserve une destination unique par section, dans l’ordre attendu', () => {
    expect(DASHBOARD_TABS.map((tab) => tab.key)).toEqual([
      'projects',
      'activity',
      'usage',
      'team',
      'settings',
    ])
    expect(new Set(DASHBOARD_TABS.map((tab) => tab.href)).size).toBe(DASHBOARD_TABS.length)
  })
})
