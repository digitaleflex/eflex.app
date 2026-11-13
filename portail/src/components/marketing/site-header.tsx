'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-switcher'
import { cn } from '@/lib/utils'

const links = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/#questions', label: 'Questions' },
  { href: '/status', label: 'Statut' },
]

/**
 * Navigation marketing partagée (page d'accueil et /status).
 *
 * Surface : l'utilitaire `glass` de `globals.css` (`bg-background/85` +
 * `backdrop-blur-md`), donc entièrement pilotée par les jetons sémantiques :
 * verre clair à texte foncé dans le thème clair, verre sombre à texte clair
 * dans le thème sombre. Elle reste lisible posée sur le hero navy (le fond
 * transparaît à 15 % seulement) comme sur les sections claires, sans style
 * propre au composant et sans toucher aux jetons globaux.
 *
 * Aucun menu n'est ajouté : sous `lg`, la navigation est masquée (`hidden` =
 * display:none, donc hors ordre de tabulation — pas de piège de focus) et
 * reste accessible depuis le pied de page.
 */
export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 glass">
      <nav
        aria-label="Navigation du site"
        className="container flex h-16 items-center justify-between gap-2 sm:gap-4"
      >
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Image
            src="/logo-horizontal.webp"
            alt="Eflex — accueil"
            width={1200}
            height={312}
            className="h-6 w-auto sm:h-7 lg:h-8"
            priority
          />
        </Link>

        <ul className="hidden lg:flex items-center gap-1">
          {links.map((link) => {
            const current = pathname === link.href
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    current
                      ? 'text-foreground'
                      : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* 44 px en pointeur grossier (convention du dépôt), 36 px en pointeur fin.
              Masqué sur l'accueil : la page est volontairement en thème clair. */}
          {pathname !== '/' && <ThemeToggle className="mr-1" />}
          {/* Sous 640 px, l'en-tête ne garde que l'action principale : « Connexion »
              reste accessible depuis la page d'inscription, sans débordement horizontal. */}
          <Link
            href="/login"
            className="hidden h-11 items-center whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-flex sm:px-3"
          >
            Connexion
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center whitespace-nowrap rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4"
          >
            Créer un compte
          </Link>
        </div>
      </nav>
    </header>
  )
}
