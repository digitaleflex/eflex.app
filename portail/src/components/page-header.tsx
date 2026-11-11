import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  /** Titre unique de la page (h1). */
  title: ReactNode
  /** Une ou deux phrases : ce que montre la page et sur quoi portent les chiffres. */
  description?: ReactNode
  /** Actions principales, alignées à droite sur écran large. */
  actions?: ReactNode
  className?: string
}

/**
 * En-tête commun aux pages de la console et de l'administration :
 * un h1, une description bornée et des actions facultatives.
 * Aucun « eyebrow » : le titre porte seul la hiérarchie.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
