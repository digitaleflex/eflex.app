'use client'

import Link from 'next/link'
import type { Plan } from '@/lib/plans'
import { formatLimit, usageLabel, usageLevel, usagePercent } from '@/lib/plan-usage'
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
  const finiteLimit = Number.isFinite(limit)
  const formattedLimit = formatLimit(limit)
  const pct = usagePercent(used, limit)
  const level = usageLevel(used, limit)
  const showCta = billing.blocked || billing.plan.id === 'agency' || (finiteLimit && level !== 'ok')
  const cta = billing.plan.id === 'agency' ? 'Gérer l’abonnement' : 'Mettre à niveau'
  const usageText = finiteLimit
    ? `${used.toLocaleString('fr-FR')} / ${formattedLimit} application${limit < 2 ? '' : 's'}`
    : `${used.toLocaleString('fr-FR')} application${used > 1 ? 's' : ''}`
  const usageAriaLabel = finiteLimit
    ? `${used} application${used > 1 ? 's' : ''} utilisée${used > 1 ? 's' : ''} sur ${formattedLimit}`
    : `${used} application${used > 1 ? 's' : ''} utilisée${used > 1 ? 's' : ''}`

  return (
    <Link
      href="/dashboard/organization"
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        billing.blocked && 'border-destructive/40',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-foreground">Votre plan · {billing.plan.label}</span>
        {billing.blocked ? (
          <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">Bloqué</span>
        ) : finiteLimit && level !== 'ok' ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium',
              level === 'full' ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning',
            )}
          >
            {usageLabel(level)}
          </span>
        ) : null}
      </div>
      {finiteLimit ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={usageAriaLabel}>
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300 ease-out-expo',
              level === 'full' || billing.blocked ? 'bg-destructive' : level === 'warning' ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{usageText}</span>
        {showCta ? <span className="font-medium text-primary">{cta}</span> : null}
      </div>
    </Link>
  )
}
