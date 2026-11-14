import { cn } from '@/lib/utils'

/**
 * Squelette de chargement commun aux pages rendues côté serveur :
 * il reprend la place de l'en-tête et des cartes, sans annoncer de faux chiffres.
 */
export function PageSkeleton({ cards = 4, className }: { cards?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn('space-y-6', className)}>
      <span className="sr-only" role="status">
        Chargement de la page…
      </span>
      <div className="space-y-2">
        <span className="block h-8 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <span className="block h-4 w-full max-w-prose animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>
      {cards > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, index) => (
            <span
              key={index}
              className="block h-28 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}
      <span className="block h-64 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
    </div>
  )
}
