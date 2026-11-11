import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success'

const TONES: Record<NoticeTone, { box: string; title: string; icon: string }> = {
  info: { box: 'border-info/30 bg-info/10', title: 'text-info', icon: 'text-info' },
  warning: { box: 'border-warning/30 bg-warning/10', title: 'text-warning', icon: 'text-warning' },
  danger: { box: 'border-destructive/30 bg-destructive/10', title: 'text-destructive', icon: 'text-destructive' },
  success: { box: 'border-success/30 bg-success/10', title: 'text-success', icon: 'text-success' },
}

type NoticeProps = {
  tone: NoticeTone
  title: string
  icon?: LucideIcon
  children?: ReactNode
  /** Action(s) prioritaire(s) à droite du message sur grand écran, dessous sur mobile. */
  actions?: ReactNode
  className?: string
}

/**
 * Message de situation (échec, déploiement en cours, avertissement) : titre
 * explicite, texte lisible et action de sortie. Jamais la couleur seule.
 */
export function Notice({ tone, title, icon: Icon, children, actions, className }: NoticeProps) {
  const style = TONES[tone]
  return (
    <section role="note" className={cn('rounded-xl border p-4 sm:p-5', style.box, className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {Icon && <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', style.icon)} aria-hidden="true" />}
          <div className="min-w-0 space-y-1">
            <p className={cn('text-sm font-semibold', style.title)}>{title}</p>
            {children && <div className="text-sm text-foreground/80">{children}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-4">{actions}</div>}
      </div>
    </section>
  )
}
