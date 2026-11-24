import type { ReactNode } from 'react'
import Link from 'next/link'

import { BrandLogo } from '@/components/brand-logo'

/**
 * Socle visuel des parcours d'authentification (connexion, inscription, récupération, vérification).
 * Thème EFLEX unique (clair), carte centrée sur fond structuré. Le titre principal est rendu ici pour
 * garder une hiérarchie cohérente. Les routes gardent leur logique métier.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="homepage-light relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,hsl(var(--primary)/0.10),transparent_68%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl"
      />

      <main
        id="contenu"
        tabIndex={-1}
        className="relative mx-auto flex min-h-screen w-full max-w-[34rem] flex-col justify-center px-4 py-10 focus:outline-none sm:px-6 sm:py-14"
      >
        <div className="mb-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex rounded-xl p-1.5 transition-opacity duration-200 ease-out-expo hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <BrandLogo alt="EFLEX — accueil" className="h-8 w-auto sm:h-9" priority />
          </Link>
        </div>

        <div className="animate-fade-in space-y-6">
          <header className="space-y-2 text-center">
            <h1 className="text-balance text-3xl font-extrabold tracking-tight text-foreground sm:text-[2rem]">
              {title}
            </h1>
            {description ? (
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
            ) : null}
          </header>

          {children}

          {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground/80">
          Déploiement et exploitation d’applications ·{' '}
          <Link
            href="/confidentialite"
            className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Confidentialité
          </Link>
        </p>
      </main>
    </div>
  )
}

/** Séparateur entre les fournisseurs et la connexion par adresse e-mail. */
export function AuthDivider({ label = 'ou' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
