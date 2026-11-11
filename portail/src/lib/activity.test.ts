import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_PAGE_SIZE,
  activityEmptyState,
  activityHref,
  activityHrefTemplate,
  activityWhere,
  parseActivityFilter,
  parseActivityPage,
} from './activity'

describe('filtres de la page Activité', () => {
  it('ne retient que les filtres proposés', () => {
    expect(parseActivityFilter('live')).toBe('live')
    expect(parseActivityFilter('failed')).toBe('failed')
    expect(parseActivityFilter('active')).toBe('active')
    expect(parseActivityFilter(['failed', 'live'])).toBe('failed')
    expect(parseActivityFilter(undefined)).toBe('all')
    expect(parseActivityFilter('building')).toBe('all')
  })

  it('borne la page demandée', () => {
    expect(parseActivityPage('3')).toBe(3)
    expect(parseActivityPage('0')).toBe(1)
    expect(parseActivityPage('-2')).toBe(1)
    expect(parseActivityPage('abc')).toBe(1)
    expect(parseActivityPage(undefined)).toBe(1)
  })

  it('restreint toujours les déploiements à l’organisation', () => {
    expect(activityWhere('org-1', 'all')).toEqual({ project: { organizationId: 'org-1' } })
    expect(activityWhere('org-1', 'live')).toMatchObject({ status: 'live' })
    expect(activityWhere('org-1', 'failed')).toMatchObject({ status: 'failed' })
    expect(activityWhere('org-1', 'active')).toEqual({
      project: { organizationId: 'org-1' },
      status: { in: ['queued', 'analyzing', 'provisioning', 'building', 'deploying'] },
    })
  })

  it('construit des liens stables pour les onglets et la pagination', () => {
    expect(activityHref('all')).toBe('/dashboard/activity')
    expect(activityHref('failed')).toBe('/dashboard/activity?status=failed')
    expect(activityHref('live', 2)).toBe('/dashboard/activity?status=live&page=2')
    expect(activityHrefTemplate('all')).toBe('/dashboard/activity?page=')
    expect(activityHrefTemplate('active')).toBe('/dashboard/activity?status=active&page=')
    expect(ACTIVITY_PAGE_SIZE).toBeGreaterThan(0)
  })

  it('fournit un état vide spécifique et une sortie de filtre', () => {
    expect(activityEmptyState('all').resetLabel).toBeNull()
    for (const filter of ['live', 'failed', 'active'] as const) {
      const copy = activityEmptyState(filter)
      expect(copy.title).not.toBe('')
      expect(copy.resetLabel).not.toBeNull()
    }
  })
})
