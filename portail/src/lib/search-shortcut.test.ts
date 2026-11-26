import { describe, expect, it } from 'vitest'
import { isSearchShortcut } from './search-shortcut'

describe('isSearchShortcut', () => {
  it('accepte « / » seul, hors saisie', () => {
    expect(isSearchShortcut({ key: '/', target: { tagName: 'BODY' } })).toBe(true)
    expect(isSearchShortcut({ key: '/', target: null })).toBe(true)
  })
  it('ignore les autres touches', () => {
    expect(isSearchShortcut({ key: 'k' })).toBe(false)
  })
  it('ne se déclenche pas pendant une saisie', () => {
    for (const tagName of ['INPUT', 'textarea', 'SELECT']) {
      expect(isSearchShortcut({ key: '/', target: { tagName } })).toBe(false)
    }
    expect(isSearchShortcut({ key: '/', target: { tagName: 'DIV', isContentEditable: true } })).toBe(false)
  })
  it('ne se déclenche pas avec un modificateur ni si déjà traité', () => {
    expect(isSearchShortcut({ key: '/', ctrlKey: true })).toBe(false)
    expect(isSearchShortcut({ key: '/', metaKey: true })).toBe(false)
    expect(isSearchShortcut({ key: '/', altKey: true })).toBe(false)
    expect(isSearchShortcut({ key: '/', defaultPrevented: true })).toBe(false)
  })
  it('ne se déclenche pas dans une fenêtre modale', () => {
    expect(isSearchShortcut({ key: '/', target: { tagName: 'BUTTON', closest: () => ({}) } })).toBe(false)
    expect(isSearchShortcut({ key: '/', target: { tagName: 'BUTTON', closest: () => null } })).toBe(true)
  })
})
