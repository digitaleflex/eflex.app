import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

type SectionCardProps = {
  /** Identifiant de section, aussi utilisé pour le titre (`<id>-title`). */
  id: string
  title: ReactNode
  icon?: LucideIcon
  description?: ReactNode
  /** Actions alignées à droite du titre (lien, bouton déjà rendu). */
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/**
 * Carte de section locale aux pages projet : même en-tête partout
 * (titre, description, actions), le corps restant libre pour une liste,
 * une grille ou des champs. `components/ui` n'est pas modifié.
 */
export function SectionCard({
  id,
  title,
  icon: Icon,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  const titleId = `${id}-title`
  return (
    <section aria-labelledby={titleId} className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            {title}
          </h2>
          {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

type EmptyPanelProps = {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}

/** État vide encadré, pour une zone qui n'a pas déjà sa propre carte. */
export function EmptyPanel({ title, description, icon, action, className }: EmptyPanelProps) {
  return (
    <div className={cn('rounded-xl border border-dashed border-border bg-card', className)}>
      <EmptyState title={title} description={description} icon={icon} action={action} />
    </div>
  )
}
