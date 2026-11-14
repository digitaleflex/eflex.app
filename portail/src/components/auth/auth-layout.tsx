import type { ReactNode } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

import { ThemeToggle } from '@/components/theme-switcher'
import { BrandLogo } from '@/components/brand-logo'

const POINTS = [
  'Détection automatique de votre stack',
  'Hébergement HTTPS et certificats gérés',
  'Journal de déploiement en direct',
] as const

/**
 * Socle visuel commun aux cinq parcours d'authentification (issue #54).
 *
 * Les routes et leurs logiques métier restent séparées : ce composant ne pose
 * que la grammaire visuelle (panneau navy d'identité + panneau formulaire),
 * avec une variante mobile compacte. Le titre principal est rendu ici pour que
 * l'ordre des titres reste cohérent sur toutes les pages.
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
    <div className="min-h-screen bg-background">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,44%)_minmax(0,56%)]">
        <aside
          aria-label="Présentation d’EFLEX"
          className="hidden border-r border-white/10 bg-eflexnavy px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-14"
        >
          <Link
            href="/"
            className="inline-flex w-fit rounded-xl py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
          >
            <BrandLogo tone="dark" alt="EFLEX — accueil" className="h-8 w-auto" priority />
          </Link>

          <div className="max-w-sm space-y-6 py-10">
            <p className="text-2xl font-semibold leading-snug">
              Poussez votre code.
              <br />
              EFLEX le met en ligne.
            </p>
            <p className="text-sm leading-relaxed text-white/80">
              Détection de la stack, construction et publication : votre projet passe du dépôt à une URL
              sécurisée sans serveur à configurer.
            </p>
            <ul className="space-y-3 text-sm text-white/90">
              {POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-eflexsky" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/75">Console de déploiement EFLEX</p>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="flex h-16 items-center justify-between gap-4 bg-eflexnavy px-4 sm:px-6 lg:justify-end lg:bg-transparent lg:px-8">
            <Link
              href="/"
              className="inline-flex rounded-lg py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy lg:hidden"
            >
              <BrandLogo alt="EFLEX — accueil" className="h-6 w-auto" priority />
            </Link>
            <ThemeToggle />
          </header>

          <main
            id="contenu"
            tabIndex={-1}
            className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 focus:outline-none sm:px-6 lg:items-center lg:px-8 lg:py-12"
          >
            <div className="w-full max-w-md animate-fade-in space-y-6">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
                {description && <p className="text-muted-foreground">{description}</p>}
              </div>

              {children}

              {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

/** Séparateur « ou » entre Google et la connexion par adresse e-mail. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ou</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}
