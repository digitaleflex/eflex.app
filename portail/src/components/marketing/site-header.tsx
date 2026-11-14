'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-switcher'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'

const links = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/#questions', label: 'Questions' },
  { href: '/status', label: 'Statut' },
]

/**
 * Navigation marketing partagée (pages publiques).
 *
 * - Bureau (>= lg) : liens visibles dans la barre.
 * - Mobile/tablette (< lg) : menu accessible via bouton, avec toutes les destinations.
 * - « Connexion » reste accessible en un geste sur téléphone (toujours visible dans la barre).
 * - Accessibilité : aria-expanded/controls, fermeture au clavier (Échap), rendu du focus au bouton,
 *   et défilement du fond bloqué pendant l’ouverture.
 */
export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
        return
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const firstLink = panelRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')
    firstLink?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const closeMenu = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

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
          <BrandLogo alt="EFLEX — accueil" className="h-6 w-auto sm:h-7 lg:h-8" priority />
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
          {pathname !== '/' && <ThemeToggle className="mr-1 hidden sm:inline-flex" />}

          {/* Connexion toujours accessible en un geste, y compris sur téléphone. */}
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-foreground/80 transition-colors duration-200 ease-out-expo hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 [@media(pointer:coarse)]:min-h-11"
          >
            Connexion
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors duration-200 ease-out-expo hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4 [@media(pointer:coarse)]:h-11"
          >
            <span className="sm:hidden">Compte</span>
            <span className="hidden sm:inline">Créer un compte</span>
          </Link>

          <button
            ref={buttonRef}
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => (open ? closeMenu() : setOpen(true))}
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm motion-reduce:transition-none"
            aria-label="Fermer le menu"
            tabIndex={-1}
            onClick={closeMenu}
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border bg-card p-4 shadow-xl motion-reduce:transition-none"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Navigation</p>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Fermer le menu"
                onClick={closeMenu}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="mt-4 flex flex-col gap-1">
              {links.map((link) => {
                const current = pathname === link.href
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? 'page' : undefined}
                      onClick={closeMenu}
                      className={cn(
                        'flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        current ? 'bg-muted text-foreground' : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="mt-6 border-t border-border pt-4">
              <Link
                href="/login"
                onClick={closeMenu}
                className="flex min-h-11 items-center justify-center rounded-lg border border-input px-4 text-base font-medium transition-colors duration-200 ease-out-expo hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Connexion
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
