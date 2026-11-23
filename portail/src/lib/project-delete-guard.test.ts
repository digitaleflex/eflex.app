import { describe, expect, it } from 'vitest'
import { projectDeleteBlockedReason } from './project-delete-guard'

const withDb = { name: 'Boutique', databases: [{}, {}] }

describe('garde-fou de suppression de projet (#175)', () => {
  it('ne gêne pas un projet sans base de données', () => {
    expect(projectDeleteBlockedReason({ name: 'Blog', databases: [] }, null)).toBeNull()
  })
  it('exige le nom exact quand des bases existent', () => {
    expect(projectDeleteBlockedReason(withDb, null)).toContain('2 base(s)')
    expect(projectDeleteBlockedReason(withDb, {})).not.toBeNull()
    expect(projectDeleteBlockedReason(withDb, { confirmName: 'boutique' })).not.toBeNull()
    expect(projectDeleteBlockedReason(withDb, { confirmName: 42 })).not.toBeNull()
    expect(projectDeleteBlockedReason(withDb, 'Boutique')).not.toBeNull()
  })
  it('accepte la confirmation exacte', () => {
    expect(projectDeleteBlockedReason(withDb, { confirmName: 'Boutique' })).toBeNull()
  })
})
