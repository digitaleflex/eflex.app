import Link from 'next/link'
import { Check } from 'lucide-react'
import type { PricingPlanView } from '@/lib/pricing-view'
import { cn } from '@/lib/utils'

/**
 * Carte d'un plan sur `/tarifs`. Le plan `highlighted` est mis en avant par un
 * contour bleu royal plein, une élévation plus forte et un bouton plein : aucune
 * couleur décorative ni dégradé, uniquement des jetons sémantiques.
 */
export function PricingPlanCard({ plan }: { plan: PricingPlanView }) {
  const titleId = `plan-${plan.id}`

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative flex flex-col rounded-2xl bg-card p-6 text-card-foreground sm:p-7',
        plan.highlighted
          ? 'border-2 border-primary shadow-lg'
          : 'border border-border shadow-sm',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 id={titleId} className="text-xl font-semibold tracking-tight">
          {plan.label}
        </h3>
        {plan.highlighted && (
          <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            Recommandé
          </span>
        )}
      </div>
      <p className="mt-2 min-h-12 text-sm text-muted-foreground text-pretty">{plan.tagline}</p>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {plan.amount ? (
          <>
            <span className="text-4xl font-bold tracking-tight tabular-nums">{plan.amount}</span>
            <span className="text-sm font-medium text-muted-foreground">{plan.unit}</span>
          </>
        ) : (
          <span className="text-4xl font-bold tracking-tight">{plan.priceLabel}</span>
        )}
      </p>

      <Link
        href="/register"
        aria-describedby={titleId}
        className={cn(
          'mt-6 inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-200 ease-out-expo active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          plan.highlighted
            ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md'
            : 'border border-input bg-background text-foreground hover:bg-muted',
        )}
      >
        {plan.isFree ? 'Commencer gratuitement' : `Choisir ${plan.label}`}
      </Link>

      <ul className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
        {plan.limits.map((limit) => (
          <li key={limit.key} className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="tabular-nums">{limit.sentence}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
