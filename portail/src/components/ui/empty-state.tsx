import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  /** Verbe ou constat, en français : « Aucun utilisateur trouvé ». */
  title: string
  description?: ReactNode
  icon?: LucideIcon
  /** Action principale : bouton ou lien déjà rendu par l'appelant. */
  action?: ReactNode
  className?: string
}

/** État vide réutilisable : icône discrète, titre, explication et action de sortie. */
export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      {Icon && (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-pill bg-muted text-muted-foreground"
        >
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="mx-auto max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  )
}
