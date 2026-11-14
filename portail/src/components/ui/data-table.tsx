'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPageRange, nextSort, paginate, sortRows, type SortState, type SortableValue } from '@/lib/table'
import { cn } from '@/lib/utils'

export type DataTableColumn<T> = {
  /** Identifiant stable, unique dans le tableau. */
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Fournir cette fonction rend la colonne triable. */
  sortValue?: (row: T) => SortableValue
  align?: 'left' | 'center' | 'right'
  /** Masque la colonne dans le repli en cartes sous 640 px. */
  hideOnMobile?: boolean
  /** Libellé du champ dans la carte mobile (par défaut l'en-tête texte). */
  mobileLabel?: string
  headerClassName?: string
  className?: string
}

export type DataTableProps<T> = {
  data: readonly T[]
  columns: readonly DataTableColumn<T>[]
  getRowId: (row: T) => string
  /** Décrit le contenu, lu par les lecteurs d'écran. */
  caption: string
  empty?: ReactNode
  loading?: boolean
  pageSize?: number
  initialSort?: SortState
  toolbar?: ReactNode
  className?: string
}

const alignClass = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

/**
 * Tableau de données générique : tri à trois états, pagination locale, squelette de
 * chargement et repli en cartes sous 640 px (aucun défilement horizontal de la page).
 * Les en-têtes triables sont de vrais boutons ; `aria-sort` annonce la direction.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  caption,
  empty,
  loading = false,
  pageSize = 20,
  initialSort,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    if (!sort) return [...data]
    const column = columns.find((entry) => entry.id === sort.columnId)
    if (!column?.sortValue) return [...data]
    return sortRows(data, column.sortValue, sort.direction)
  }, [data, columns, sort])

  const slice = paginate(sorted, page, pageSize)
  const sortable = columns.filter((column) => column.sortValue)
  const mobileColumns = columns.filter((column) => !column.hideOnMobile)

  const labelFor = (column: DataTableColumn<T>) =>
    column.mobileLabel ?? (typeof column.header === 'string' ? column.header : column.id)

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortValue) return
    setSort((current) => nextSort(current, column.id))
    setPage(1)
  }

  const mobileSortOptions = sortable.flatMap((column) => [
    { value: `${column.id}:asc`, label: `${labelFor(column)} : croissant` },
    { value: `${column.id}:desc`, label: `${labelFor(column)} : décroissant` },
  ])

  return (
    <Card className={cn('overflow-hidden', className)} aria-busy={loading || undefined}>
      {toolbar && <div className="border-b border-border p-4">{toolbar}</div>}
      {loading && (
        <p role="status" aria-live="polite" className="sr-only">
          Chargement des données…
        </p>
      )}

      {!loading && data.length === 0 ? (
        empty ?? (
          <EmptyState
            title="Aucun résultat"
            description="Aucune ligne ne correspond aux filtres actuels. Modifiez la recherche ou réinitialisez les filtres."
          />
        )
      ) : (
        <>
          {sortable.length > 0 && (
            <div className="border-b border-border p-4 sm:hidden">
              <Select
                label="Trier par"
                value={sort ? `${sort.columnId}:${sort.direction}` : ''}
                placeholder="Ordre d’origine"
                options={mobileSortOptions}
                onChange={(event) => {
                  const [columnId, direction] = event.target.value.split(':')
                  setSort(columnId && direction === 'desc' ? { columnId, direction: 'desc' } : columnId ? { columnId, direction: 'asc' } : null)
                  setPage(1)
                }}
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="hidden w-full text-left text-sm sm:table">
              <caption className="sr-only">{caption}</caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  {columns.map((column) => {
                    const active = sort?.columnId === column.id
                    const ariaSort = column.sortValue ? (active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
                    return (
                      <th
                        key={column.id}
                        scope="col"
                        aria-sort={ariaSort}
                        className={cn('px-4 py-2 font-medium', alignClass[column.align ?? 'left'], column.headerClassName)}
                      >
                        {column.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column)}
                            aria-label={`Trier par ${labelFor(column)}`}
                            className={cn(
                              'inline-flex min-h-11 items-center gap-1.5 rounded-md font-medium',
                              'transition-colors duration-200 ease-out-expo hover:text-foreground',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                              active && 'text-foreground'
                            )}
                          >
                            {column.header}
                            {active ? (
                              sort.direction === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: Math.min(pageSize, 5) }, (_, index) => (
                      <tr key={`skeleton-${index}`}>
                        {columns.map((column) => (
                          <td key={column.id} className="px-4 py-3">
                            <Skeleton className="h-4 w-full max-w-40" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : slice.items.map((row) => (
                      <tr key={getRowId(row)}>
                        {columns.map((column) => (
                          <td key={column.id} className={cn('px-4 py-3 align-top', alignClass[column.align ?? 'left'], column.className)}>
                            {column.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          <ul aria-label={caption} className="divide-y divide-border sm:hidden">
            {loading
              ? Array.from({ length: Math.min(pageSize, 4) }, (_, index) => (
                  <li key={`skeleton-card-${index}`} className="space-y-2 p-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-2/3" />
                  </li>
                ))
              : slice.items.map((row) => (
                  <li key={getRowId(row)} className="p-4">
                    <dl className="space-y-1.5">
                      {mobileColumns.map((column) => (
                        <div key={column.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <dt className="text-xs text-muted-foreground">{labelFor(column)}</dt>
                          <dd className="min-w-0 text-right text-sm">{column.cell(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
          </ul>

          {!loading && slice.total > 0 && (
            <div className="space-y-3 border-t border-border p-4">
              <p className="text-xs text-muted-foreground tabular-nums">{formatPageRange(slice)}</p>
              <Pagination
                page={slice.page}
                pages={slice.pages}
                onPageChange={setPage}
                label={`Pagination de ${caption}`}
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
