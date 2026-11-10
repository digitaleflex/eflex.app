import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type StatTone = 'default' | 'neutral' | 'positive' | 'warning' | 'critical' | 'info'

const tones: Record<StatTone, { chip: string; value: string }> = {
  default: { chip: 'bg-primary/10 text-primary', value: 'text-foreground' },
  neutral: { chip: 'bg-muted text-muted-foreground', value: 'text-foreground' },
  positive: { chip: 'bg-success/10 text-success', value: 'text-foreground' },
  warning: { chip: 'bg-warning/10 text-warning', value: 'text-foreground' },
  critical: { chip: 'bg-destructive/10 text-destructive', value: 'text-foreground' },
  info: { chip: 'bg-info/10 text-info', value: 'text-foreground' },
}

type StatCardProps = {
  label: string
  /** Valeur déjà formatée (« 1 248 », « 99,8 % ») : le chiffre reste tabulaire. */
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: StatTone
  /** Rend toute la carte cliquable quand le détail existe ailleurs. */
  href?: string
  className?: string
}

/** Indicateur chiffré : libellé, valeur tabulaire, précision et icône optionnelle. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'default', href, className }: StatCardProps) {
  const body = (
    <CardContent className="flex items-start justify-between gap-3 p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn('text-3xl font-bold tracking-tight tabular-nums', tones[tone].value)}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <span aria-hidden="true" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-control', tones[tone].chip)}>
          <Icon className="h-5 w-5" />
        </span>
      )}
    </CardContent>
  )

  if (!href) return <Card className={className}>{body}</Card>

  return (
    <Card className={cn('transition-[box-shadow,border-color] duration-200 ease-out-expo hover:shadow-md', className)}>
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </Card>
  )
}
