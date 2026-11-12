import { describe, expect, it } from 'vitest'
import { isDismissible, selectBanner } from '@/lib/banner-priority'

describe('banner-priority', () => {
  it('retourne null sans bandeau actif', () => {
    expect(selectBanner([])).toBeNull()
  })

  it('choisit le bandeau le plus prioritaire', () => {
    expect(selectBanner(['maintenance', 'announcement'])).toBe('maintenance')
    expect(selectBanner(['announcement', 'past_due', 'maintenance'])).toBe('past_due')
    expect(selectBanner(['suspension', 'impersonation', 'past_due'])).toBe('impersonation')
  })

  it('seule l’annonce est fermable', () => {
    expect(isDismissible('announcement')).toBe(true)
    expect(isDismissible('maintenance')).toBe(false)
    expect(isDismissible('past_due')).toBe(false)
  })
})
