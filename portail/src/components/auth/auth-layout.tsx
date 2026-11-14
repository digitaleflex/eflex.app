import type { ReactNode } from 'react'
import Link from 'next/link'

import { ThemeToggle } from '@/components/theme-switcher'
import { BrandLogo } from '@/components/brand-logo'

/**
 * Socle visuel commun aux parcours d'authentification (issue #54), refonte V2 : une seule carte
 * centrée sur un fond neutre, le logo au-dessus, rien d'autre. Pas de panneau de présentation :
 * la personne est là pour entrer, pas pour relire l'accueil.
 *
 * Les routes et leurs logiques métier restent séparées : ce composant ne pose que la grammaire
 * visuelle. Le titre principal est rendu ici pour que l'ordre des titres reste cohérent partout.
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
    <div className="relative flex min-h-screen flex-col bg-muted/50">
      <div className="absolute right-4 top-3 sm:right-6">
        <ThemeToggle />
      </div>

      <main
        id="contenu"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center px-4 pb-12 pt-14 focus:outline-none sm:px-6 sm:pt-20"
      >
        <Link
          href="/"
          className="inline-flex rounded-xl p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandLogo alt="EFLEX — accueil" className="h-8 w-auto" priority />
        </Link>

        <div className="mt-8 w-full max-w-md animate-fade-in space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
            {description && <p className="text-muted-foreground text-pretty">{description}</p>}
          </div>

          {children}

          {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

/** Séparateur entre les fournisseurs et la connexion par adresse e-mail. */
export function AuthDivider({ label = 'ou' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
