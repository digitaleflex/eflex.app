import { Check, CircleAlert, Clock, Loader2, Minus } from 'lucide-react'
import { statusInfo, type StatusTone } from '@/lib/project-status'
import { cn } from '@/lib/utils'

const TONE: Record<StatusTone, string> = {
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-warning/10 text-warning border-warning/25',
  danger: 'bg-destructive/10 text-destructive border-destructive/25',
  neutral: 'bg-muted text-muted-foreground border-border',
}

/** Pastille de statut : icône + texte (jamais la couleur seule), une seule ligne, ne se déforme pas. */
export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const info = statusInfo(status)
  const Icon = info.tone === 'success' ? Check : info.tone === 'danger' ? CircleAlert : info.inProgress && info.tone === 'warning' ? Loader2 : info.inProgress ? Clock : Minus
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-medium', TONE[info.tone], className)}>
      <Icon className={cn('h-3 w-3', info.inProgress && info.tone === 'warning' && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
      {info.label}
    </span>
  )
}

/** Point de statut compact pour les listes denses (le libellé est fourni en texte masqué). */
export function StatusDot({ status, className }: { status: string | null | undefined; className?: string }) {
  const info = statusInfo(status)
  const color = info.tone === 'success' ? 'bg-success' : info.tone === 'danger' ? 'bg-destructive' : info.tone === 'warning' ? 'bg-warning' : 'bg-muted-foreground/50'
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', color, info.inProgress && 'animate-pulse motion-reduce:animate-none')} />
      <span className="sr-only">{info.label}</span>
    </span>
  )
}
