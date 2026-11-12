'use client'

import Link from 'next/link'
import type { Plan } from '@/lib/plans'
import { usageLabel, usageLevel, usagePercent } from '@/lib/plan-usage'
import { cn } from '@/lib/utils'

type BillingLite = {
  plan: Pick<Plan, 'id' | 'label'>
  usage: { apps: number }
  limits: { projects: number }
  blocked?: boolean
}

export function PlanWidget({ billing, className }: { billing: BillingLite; className?: string }) {
  const used = billing.usage.apps
  const limit = billing.limits.projects
  const pct = usagePercent(used, limit)
  const level = usageLevel(used, limit)
  const cta = billing.plan.id === 'agency' ? 'Gérer l’abonnement' : 'Mettre à niveau'
  return (
    <Link
      href="/dashboard/organization"
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        billing.blocked && 'border-destructive/40',
        className,
      )}
      aria-label={`Votre plan ${billing.plan.label}, ${used} applications sur ${limit}. ${usageLabel(level)}.`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">Votre plan · {billing.plan.label}</span>
        {billing.blocked ? (
          <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Bloqué</span>
        ) : level !== 'ok' ? (
          <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', level === 'full' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning')}>
            {usageLabel(level)}
          </span>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${used} sur ${limit} applications utilisées`}>
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out-expo',
            level === 'full' || billing.blocked ? 'bg-destructive' : level === 'warning' ? 'bg-warning' : 'bg-primary',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{used} / {limit} applications</span>
        <span className="font-medium text-primary">{cta}</span>
      </div>
    </Link>
  )
}
