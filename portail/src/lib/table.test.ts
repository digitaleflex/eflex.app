import { describe, expect, it } from 'vitest'
import {
  compareValues,
  formatPageRange,
  nextSort,
  pageList,
  paginate,
  sortRows,
} from '@/lib/table'

type Row = { name: string; score: number | null; created: Date }

const rows: Row[] = [
  { name: 'Zoé', score: 30, created: new Date('2026-01-03') },
  { name: 'élise', score: null, created: new Date('2026-01-01') },
  { name: 'Émile', score: 10, created: new Date('2026-01-02') },
]

describe('compareValues', () => {
  it('classe les nombres et les dates', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues(new Date('2026-01-01'), new Date('2026-01-02'))).toBeLessThan(0)
  })

  it('classe le texte français sans tenir compte des accents ni de la casse', () => {
    expect(compareValues('élise', 'Emile')).toBeLessThan(0)
    expect(compareValues('Émile', 'émile')).toBe(0)
    expect(compareValues('projet 2', 'projet 10')).toBeLessThan(0)
  })

  it('place les valeurs vides en dernier', () => {
    expect(compareValues(null, 'a')).toBeGreaterThan(0)
    expect(compareValues('', 'a')).toBeGreaterThan(0)
    expect(compareValues(null, undefined)).toBe(0)
  })
})

describe('sortRows', () => {
  it('trie sans muter la source', () => {
    const source = [...rows]
    const sorted = sortRows(rows, (row) => row.name, 'asc')
    expect(sorted.map((row) => row.name)).toEqual(['élise', 'Émile', 'Zoé'])
    expect(rows).toEqual(source)
  })

  it('garde les vides en fin de liste dans les deux sens', () => {
    expect(sortRows(rows, (row) => row.score, 'asc').map((row) => row.name)).toEqual(['Émile', 'Zoé', 'élise'])
    expect(sortRows(rows, (row) => row.score, 'desc').map((row) => row.name)).toEqual(['Zoé', 'Émile', 'élise'])
  })

  it('est stable à valeur égale', () => {
    const tied = [
      { id: 'a', value: 1 },
      { id: 'b', value: 1 },
      { id: 'c', value: 1 },
    ]
    expect(sortRows(tied, (row) => row.value, 'desc').map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('rend l’ordre d’origine quand aucun tri n’est demandé', () => {
    expect(sortRows(rows, (row) => row.name, null)).toEqual(rows)
  })
})

describe('nextSort', () => {
  it('alterne croissant, décroissant puis aucun tri', () => {
    const first = nextSort(null, 'name')
    expect(first).toEqual({ columnId: 'name', direction: 'asc' })
    const second = nextSort(first, 'name')
    expect(second).toEqual({ columnId: 'name', direction: 'desc' })
    expect(nextSort(second, 'name')).toBeNull()
  })

  it('repart en croissant quand on change de colonne', () => {
    expect(nextSort({ columnId: 'name', direction: 'desc' }, 'created')).toEqual({
      columnId: 'created',
      direction: 'asc',
    })
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, index) => index + 1)

  it('découpe et calcule les bornes', () => {
    const slice = paginate(items, 2, 10)
    expect(slice.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(slice).toMatchObject({ page: 2, pages: 3, start: 11, end: 20, total: 23 })
  })

  it('borne la page demandée', () => {
    expect(paginate(items, 99, 10).page).toBe(3)
    expect(paginate(items, 0, 10).page).toBe(1)
    expect(paginate(items, Number.NaN, 10).page).toBe(1)
    expect(paginate(items, 3, 10).items).toEqual([21, 22, 23])
  })

  it('gère une liste vide et une taille invalide', () => {
    expect(paginate([], 1, 10)).toMatchObject({ page: 1, pages: 1, start: 0, end: 0, total: 0 })
    expect(paginate(items, 1, 0).items).toHaveLength(1)
  })
})

describe('pageList', () => {
  it('affiche toutes les pages quand elles tiennent', () => {
    expect(pageList(1, 1)).toEqual([1])
    expect(pageList(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('ajoute des ellipses autour de la page courante', () => {
    expect(pageList(5, 20)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 20])
    expect(pageList(1, 20)).toEqual([1, 2, 'ellipsis', 20])
    expect(pageList(20, 20)).toEqual([1, 'ellipsis', 19, 20])
  })

  it('borne une page hors limites', () => {
    expect(pageList(0, 20)).toEqual([1, 2, 'ellipsis', 20])
    expect(pageList(50, 20)).toEqual([1, 'ellipsis', 19, 20])
  })
})

describe('formatPageRange', () => {
  it('formate les bornes en français', () => {
    expect(formatPageRange({ start: 21, end: 40, total: 128 })).toBe('21–40 sur 128')
    expect(formatPageRange({ start: 0, end: 0, total: 0 })).toBe('Aucun résultat')
  })
})
