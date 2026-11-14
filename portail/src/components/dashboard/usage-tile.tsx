import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * Résumé d'usage : une bande compacte, sans valeur inventée. CPU et mémoire sont des relevés
 * instantanés par application (quand l'hébergement les expose) ; stockage et bande passante ne sont
 * pas encore mesurés (#119, #120), donc rien n'est affiché pour eux.
 */
export function UsageTile() {
  return (
    <section
      aria-labelledby="usage-tile-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div className="min-w-0 space-y-1">
        <h2 id="usage-tile-title" className="text-sm font-semibold">Utilisation des ressources</h2>
        <p className="text-xs text-muted-foreground text-pretty">
          CPU et mémoire : relevé instantané par application, quand l’hébergement le fournit. Stockage et bande
          passante : pas encore mesurés, donc aucune valeur affichée.
        </p>
      </div>
      <Link
        href="/dashboard/usage"
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Voir le détail de l’utilisation
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}
