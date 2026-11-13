import { PRICING_LIMIT_LABELS, type PricingLimitKey, type PricingPlanView } from '@/lib/pricing-view'
import { cn } from '@/lib/utils'

const ROWS: PricingLimitKey[] = ['apps', 'members', 'domains']

/**
 * Comparatif des plans : vrai tableau (`caption`, en-têtes `scope`). Sous la
 * largeur utile, seul le tableau défile horizontalement dans une région
 * focalisable et nommée ; la page elle-même ne déborde jamais.
 */
export function PricingComparison({ plans }: { plans: PricingPlanView[] }) {
  return (
    <div
      role="region"
      aria-label="Tableau comparatif des plans"
      tabIndex={0}
      className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Prix mensuel et limites de chaque plan Eflex, en francs CFA.
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-4 font-medium text-muted-foreground sm:px-6">
              Plan
            </th>
            {plans.map((plan) => (
              <th
                key={plan.id}
                scope="col"
                className={cn(
                  'px-4 py-4 text-right font-semibold sm:px-6',
                  plan.highlighted && 'bg-primary/5 text-primary',
                )}
              >
                {plan.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <th scope="row" className="px-4 py-4 font-medium sm:px-6">
              Prix mensuel
            </th>
            {plans.map((plan) => (
              <td
                key={plan.id}
                className={cn(
                  'whitespace-nowrap px-4 py-4 text-right tabular-nums sm:px-6',
                  plan.highlighted && 'bg-primary/5',
                )}
              >
                {plan.priceLabel}
              </td>
            ))}
          </tr>
          {ROWS.map((key, index) => (
            <tr key={key} className={cn(index < ROWS.length - 1 && 'border-b border-border')}>
              <th scope="row" className="px-4 py-4 font-medium sm:px-6">
                {PRICING_LIMIT_LABELS[key]}
              </th>
              {plans.map((plan) => (
                <td
                  key={plan.id}
                  className={cn('px-4 py-4 text-right tabular-nums sm:px-6', plan.highlighted && 'bg-primary/5')}
                >
                  {plan.limits.find((limit) => limit.key === key)?.display}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
