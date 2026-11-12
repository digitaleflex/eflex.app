import Link from 'next/link'
import { ArrowRight, Cpu, HardDrive, Wifi } from 'lucide-react'

export function UsageTile() {
  return (
    <section aria-labelledby="usage-tile-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 id="usage-tile-title" className="text-sm font-semibold">Utilisation des ressources</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Mesures réelles uniquement, avec source et unité indiquées.
        </p>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <div className="bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            CPU / Mémoire
          </p>
          <p className="mt-1 text-sm font-medium">Échantillon instantané</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Affiché par application déployée quand l’hébergement (Coolify) expose ces métriques. Période : relevé instantané, non cumulé.
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            Stockage · <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
            Bande passante
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Non disponible</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aucune source de mesure documentée pour le moment — aucune valeur affichée.
          </p>
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 sm:px-5">
        <Link
          href="/dashboard/usage"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0"
        >
          Voir le détail de l’utilisation
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
