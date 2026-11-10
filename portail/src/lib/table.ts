// Logique pure du tableau de données : tri, pagination et bornes de pages.
// Aucun import React ici : testable sans DOM, réutilisable côté serveur.

export type SortDirection = 'asc' | 'desc'
export type SortState = { columnId: string; direction: SortDirection }
export type SortableValue = string | number | boolean | Date | null | undefined

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })
const integer = new Intl.NumberFormat('fr-FR')

const isBlank = (value: SortableValue): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

/** Compare deux valeurs : nombres, dates, booléens, puis texte français (accents, nombres intégrés). */
export function compareValues(a: SortableValue, b: SortableValue): number {
  if (isBlank(a) && isBlank(b)) return 0
  if (isBlank(a)) return 1
  if (isBlank(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return collator.compare(String(a), String(b))
}

/**
 * Tri stable : les valeurs vides restent en fin de liste dans les deux sens.
 * L'ordre d'origine est restauré quand `direction` vaut `null`.
 */
export function sortRows<T>(
  rows: readonly T[],
  getValue: (row: T) => SortableValue,
  direction: SortDirection | null,
): T[] {
  if (!direction) return [...rows]
  const factor = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = getValue(x.row)
      const b = getValue(y.row)
      if (isBlank(a) || isBlank(b)) return compareValues(a, b) || x.index - y.index
      return compareValues(a, b) * factor || x.index - y.index
    })
    .map((entry) => entry.row)
}

/** Cycle de tri d'un en-tête : croissant → décroissant → ordre d'origine. */
export function nextSort(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' }
  if (current.direction === 'asc') return { columnId, direction: 'desc' }
  return null
}

export type PageSlice<T> = {
  /** Page réellement affichée (bornée entre 1 et `pages`). */
  page: number
  pages: number
  /** Indices 1-based du premier et du dernier élément affichés (0 si vide). */
  start: number
  end: number
  total: number
  items: T[]
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const size = Math.max(1, Math.floor(pageSize))
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const requested = Number.isFinite(page) ? Math.floor(page) : 1
  const current = Math.min(Math.max(1, requested || 1), pages)
  const offset = (current - 1) * size
  return {
    page: current,
    pages,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(offset + size, total),
    total,
    items: rows.slice(offset, offset + size),
  }
}

const range = (from: number, to: number): number[] => {
  const out: number[] = []
  for (let i = from; i <= to; i += 1) out.push(i)
  return out
}

/**
 * Pages à afficher : première et dernière toujours visibles, fenêtre autour de la page
 * courante, ellipses quand un saut dépasse une page. Ex. page 5/20 → 1 … 4 5 6 … 20.
 */
export function pageList(page: number, pages: number, siblings = 1): Array<number | 'ellipsis'> {
  if (pages <= 1) return [1]
  const around = Math.max(0, Math.floor(siblings))
  if (pages <= around * 2 + 5) return range(1, pages)

  const current = Math.min(Math.max(1, page), pages)
  const left = Math.max(current - around, 2)
  const right = Math.min(current + around, pages - 1)
  const items: Array<number | 'ellipsis'> = [1]

  if (left > 3) items.push('ellipsis')
  else items.push(...range(2, left - 1))

  items.push(...range(left, right))

  if (right < pages - 2) items.push('ellipsis')
  else items.push(...range(right + 1, pages - 1))

  items.push(pages)
  return items
}

/** Entier au format français (espace fine insécable), sans dépendre de l'hydratation. */
export function formatInteger(value: number): string {
  return integer.format(value)
}

/** « 21–40 sur 128 » ; « Aucun résultat » quand la liste est vide. */
export function formatPageRange(slice: Pick<PageSlice<unknown>, 'start' | 'end' | 'total'>): string {
  if (slice.total === 0) return 'Aucun résultat'
  return `${formatInteger(slice.start)}–${formatInteger(slice.end)} sur ${formatInteger(slice.total)}`
}
