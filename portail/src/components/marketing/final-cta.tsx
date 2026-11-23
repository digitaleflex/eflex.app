import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function FinalCta() {
  return (
    <section aria-labelledby="appel-titre" className="py-16 md:py-24">
      <div className="container">
        <div className="surface-navy relative overflow-hidden rounded-3xl bg-eflexnavy px-6 py-12 text-white sm:px-10 md:px-12 md:py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_0%,hsl(var(--eflex-royalblue)/0.35),transparent)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -right-10 h-48 w-48 rounded-full border border-white/10 sm:h-56 sm:w-56"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-8 -right-2 h-32 w-32 rounded-full border border-white/10 sm:h-40 sm:w-40"
          />

          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="max-w-3xl">
              <h2 id="appel-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-white">
                Votre prochain projet mérite d’être en ligne.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/80 text-pretty sm:text-lg">
                Connectez votre dépôt GitHub et découvrez une nouvelle manière de déployer vos applications.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-eflexnavy transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/92 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
              >
                Créer mon compte
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/35 px-6 text-base font-semibold text-white transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
              >
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
