'use client'

import Link from 'next/link'
import type { Plan } from '@/lib/plans'
import { formatPrice } from '@/lib/plans'
import { cn } from '@/lib/utils'

type BillingLite = {
  plan: Pick<Plan, 'id' | 'label'>
  usage: { apps: number; projects: number; members: number }
  limits: { projects: number; members: number; customDomains: number }
  blocked?: boolean
  phase?: string
}

export function PlanWidget({ billing, className }: { billing: BillingLite; className?: string }) {
  const used = billing.usage.apps
  const limit = billing.limits.projects
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0
  const near = ratio >= 0.8
  return (
    <Link
      href="/dashboard/organization"
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        billing.blocked && 'border-destructive/40',
        className,
      )}
      aria-label={`Plan ${billing.plan.label}, ${used} application${used > 1 ? 's' : ''} sur ${limit}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">{billing.plan.label}</span>
        {billing.blocked && <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Bloqué</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${used} sur ${limit} applications utilisées`}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', near || billing.blocked ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {used} / {limit} app{limit > 1 ? 's' : ''}
      </p>
    </Link>
  )
}
