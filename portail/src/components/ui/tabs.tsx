'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TabItem = {
  /** Identifiant stable, sans espace (sert à la sélection contrôlée). */
  id: string
  label: ReactNode
  content: ReactNode
  disabled?: boolean
}

type TabsProps = {
  items: readonly TabItem[]
  /** Nom du groupe d'onglets, lu par les lecteurs d'écran. */
  label: string
  value?: string
  defaultValue?: string
  onValueChange?: (id: string) => void
  className?: string
  listClassName?: string
  panelClassName?: string
}

/**
 * Onglets ARIA : flèches gauche/droite (avec bouclage), Début/Fin, un seul onglet dans
 * l'ordre de tabulation. Le contenu inactif n'est pas rendu.
 */
export function Tabs({ items, label, value, defaultValue, onValueChange, className, listClassName, panelClassName }: TabsProps) {
  const baseId = useId()
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const [internal, setInternal] = useState(defaultValue)
  const controlled = value !== undefined
  const requested = controlled ? value : internal
  const fallback = items.find((item) => !item.disabled)?.id ?? items[0]?.id
  const activeId = items.some((item) => item.id === requested && !item.disabled) ? requested : fallback

  if (items.length === 0) return null

  const select = (id: string) => {
    if (!controlled) setInternal(id)
    onValueChange?.(id)
  }

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter((entry) => !entry.item.disabled)
    if (enabled.length === 0) return
    const position = enabled.findIndex((entry) => entry.itemIndex === index)
    let next: number | null = null
    if (event.key === 'ArrowRight') next = (position + 1) % enabled.length
    else if (event.key === 'ArrowLeft') next = (position - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = enabled.length - 1
    if (next === null) return
    event.preventDefault()
    const target = enabled[next]!
    select(target.item.id)
    tabRefs.current[target.itemIndex]?.focus()
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-control border border-border bg-muted p-1', listClassName)}
      >
        {items.map((item, index) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(item.id)}
              onKeyDown={(event) => handleKey(event, index)}
              className={cn(
                'inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium',
                'transition-colors duration-200 ease-out-expo',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:opacity-50',
                selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          tabIndex={item.id === activeId ? 0 : undefined}
          hidden={item.id !== activeId}
          className={cn('mt-4 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', panelClassName)}
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
