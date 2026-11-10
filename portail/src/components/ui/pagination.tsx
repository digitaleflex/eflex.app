'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatInteger, pageList } from '@/lib/table'
import { cn } from '@/lib/utils'

type PaginationProps = {
  page: number
  pages: number
  /**
   * Pagination par URL (composant serveur, sans JavaScript). Chaîne sérialisable
   * (ex. `/admin/users?page=`) : une fonction ne peut pas traverser la frontière
   * serveur → client.
   */
  hrefTemplate?: string
  /** Pagination locale (composant client). Ignoré quand `hrefTemplate` est fourni. */
  onPageChange?: (page: number) => void
  label?: string
  className?: string
}

const controlClass =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-medium transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
const idleClass = 'text-muted-foreground hover:bg-muted hover:text-foreground'
const currentClass = 'bg-primary text-primary-foreground'
const disabledClass = 'cursor-not-allowed text-muted-foreground opacity-50'

type PageControlProps = {
  target: number
  label: string
  current?: boolean
  disabled?: boolean
  hrefTemplate?: string
  onPageChange?: (page: number) => void
  className?: string
  children: ReactNode
}

function PageControl({ target, label, current = false, disabled = false, hrefTemplate, onPageChange, className, children }: PageControlProps) {
  const classes = cn(controlClass, current ? currentClass : idleClass, disabled && disabledClass, className)
  if (disabled) {
    return (
      <span aria-disabled="true" className={classes}>
        {children}
      </span>
    )
  }
  if (current) {
    return (
      <span aria-current="page" aria-label={label} className={classes}>
        {children}
      </span>
    )
  }
  if (hrefTemplate) {
    return (
      <Link href={`${hrefTemplate}${target}`} aria-label={label} className={classes}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => onPageChange?.(target)} aria-label={label} className={classes}>
      {children}
    </button>
  )
}

/**
 * Pagination accessible : cibles de 44 px, page courante annoncée par `aria-current`,
 * ellipses masquées aux lecteurs d'écran, libellés français.
 */
export function Pagination({ page, pages, hrefTemplate, onPageChange, label = 'Pagination', className }: PaginationProps) {
  if (pages <= 1) return null

  return (
    <nav aria-label={label} className={cn('flex flex-wrap items-center justify-center gap-1 sm:justify-start', className)}>
      <PageControl
        target={page - 1}
        label="Page précédente"
        disabled={page <= 1}
        hrefTemplate={hrefTemplate}
        onPageChange={onPageChange}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Précédent</span>
      </PageControl>

      <ol className="flex flex-wrap items-center gap-1">
        {pageList(page, pages).map((item, index) =>
          item === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              <PageControl
                target={item}
                label={`Page ${formatInteger(item)} sur ${formatInteger(pages)}`}
                current={item === page}
                hrefTemplate={hrefTemplate}
                onPageChange={onPageChange}
                className="tabular-nums"
              >
                {formatInteger(item)}
              </PageControl>
            </li>
          )
        )}
      </ol>

      <PageControl
        target={page + 1}
        label="Page suivante"
        disabled={page >= pages}
        hrefTemplate={hrefTemplate}
        onPageChange={onPageChange}
      >
        <span className="hidden sm:inline">Suivant</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </PageControl>
    </nav>
  )
}
