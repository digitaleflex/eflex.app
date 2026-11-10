'use client'

import { cloneElement, useId, useState, type ReactElement } from 'react'
import { cn } from '@/lib/utils'

type TooltipChild = ReactElement<{ 'aria-describedby'?: string }>

type TooltipProps = {
  /** Texte court, en français ; jamais la seule source d'une information indispensable. */
  label: string
  children: TooltipChild
  side?: 'top' | 'bottom'
  className?: string
}

/**
 * Infobulle légère : s'ouvre au survol et au focus du déclencheur, se ferme avec Échap
 * (exigence 1.4.13), à la perte de focus ou à la sortie du pointeur. Le texte est lié par
 * `aria-describedby` et reste exposé aux lecteurs d'écran même quand il est invisible.
 */
export function Tooltip({ label, children, side = 'top', className }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ')

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'block' : 'sr-only'
        )}
      >
        {label}
      </span>
    </span>
  )
}
