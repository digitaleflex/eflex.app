import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

export const metadata: Metadata = {
  title: 'Tarifs',
  description: 'La tarification EFLEX sera publiée prochainement.',
}

export default function TarifsPage() {
  return (
    <div className="homepage-light flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="flex-1">
        <section className="container py-16 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="mt-6 text-sm font-medium text-primary">Tarifs</p>
            <h1 className="mt-3 text-display-sm font-extrabold tracking-tight text-balance text-foreground sm:text-display">
              Tarification bientôt disponible
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lead-lg text-muted-foreground text-pretty">
              Nous finalisons les offres EFLEX pour proposer une tarification claire, adaptée aux développeurs, studios et agences.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-primary transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Créer un compte
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-input bg-background px-7 text-base font-semibold text-foreground transition-[background-color,border-color,color] duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Nous contacter
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
