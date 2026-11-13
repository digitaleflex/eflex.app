import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

export function LegalPage({
  title,
  description,
  updatedAt,
  children,
}: {
  title: string
  description: string
  updatedAt: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground homepage-light">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Aller au contenu
      </a>
      <SiteHeader />
      <main id="contenu" className="flex-1">
        <article className="container max-w-3xl py-12 md:py-16">
          <header className="space-y-3 border-b border-border pb-8">
            <p className="text-sm font-medium text-primary">Informations légales</p>
            <h1 className="font-display text-display-sm font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
            <p className="text-base text-muted-foreground text-pretty">{description}</p>
            <p className="text-xs text-muted-foreground">Dernière mise à jour : {updatedAt}</p>
          </header>
          <div className="mt-8 space-y-8 text-sm leading-7 text-foreground/90 sm:text-base">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function PlaceholderNotice() {
  return (
    <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
      <strong className="font-semibold">Contenu à fournir et à valider :</strong> cette section doit être complétée
      par l’éditeur du service avec les informations juridiques applicables. Aucun texte juridique définitif n’est
      fourni automatiquement par la plateforme.
    </p>
  )
}
