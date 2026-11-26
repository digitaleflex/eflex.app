/**
 * Raccourci « / » pour placer le curseur dans la recherche.
 * Logique pure : jamais déclenché pendant une saisie, avec un modificateur,
 * ni dans une fenêtre modale ouverte.
 */
export interface ShortcutEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  defaultPrevented?: boolean
  target?: unknown
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isSearchShortcut(event: ShortcutEventLike): boolean {
  if (event.key !== '/') return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.defaultPrevented) return false
  const target = event.target as
    | { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown }
    | null
    | undefined
  if (target) {
    if (target.tagName && TYPING_TAGS.has(target.tagName.toUpperCase())) return false
    if (target.isContentEditable) return false
    if (typeof target.closest === 'function' && target.closest('[role="dialog"]')) return false
  }
  return true
}
