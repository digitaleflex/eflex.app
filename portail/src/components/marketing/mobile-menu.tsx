'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SiteLink = { href: string; label: string }

/** Largeur à partir de laquelle l'en-tête affiche ses liens en ligne (`lg` de Tailwind). */
const DESKTOP_QUERY = '(min-width: 1024px)'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function unlockScroll() {
  document.documentElement.style.removeProperty('overflow')
}

/**
 * Menu de navigation du site public sous 1024 px.
 *
 * Bouton de divulgation (`aria-expanded` / `aria-controls`) qui déplie, sous
 * l'en-tête collant, un panneau contenant toutes les destinations de `links`
 * (même tableau que l'en-tête large), « Connexion » et « Créer un compte ».
 *
 * Pendant l'ouverture : focus déplacé sur le premier lien, `Tab` reste dans
 * le bouton + panneau, `Échap` ou un clic hors du panneau ferme et rend le
 * focus au bouton, la page ne défile plus. Le menu se ferme quand on suit un
 * lien (ancres `/#…` comprises) et quand la fenêtre passe en ≥ 1024 px.
 *
 * Fermé, le panneau est `invisible` (visibility:hidden) : hors ordre de
 * tabulation et hors arbre d'accessibilité, tout en gardant une transition
 * d'opacité et de translation (propriétés explicites, neutralisée par la
 * règle `prefers-reduced-motion` de `globals.css` et par `motion-reduce:`).
 */
export function MobileMenu({ links, pathname }: { links: readonly SiteLink[]; pathname: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus: boolean) => {
    // Déverrouillage synchrone : une ancre `/#…` doit pouvoir faire défiler
    // la page dans la foulée du clic, avant le prochain rendu.
    unlockScroll()
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  // Verrou de défilement + focus initial dans le panneau.
  useEffect(() => {
    if (!open) return
    document.documentElement.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return unlockScroll
  }, [open])

  // Échap ferme ; Tab boucle entre le bouton et le contenu du panneau.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      if (event.key !== 'Tab' || !panelRef.current || !buttonRef.current) return
      const items = [buttonRef.current, ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      const inside = items.includes(active as HTMLElement)
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // Passage en ≥ 1024 px : le panneau n'a plus de raison d'être.
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => {
      if (media.matches) close(false)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [close])

  // Navigation par un autre moyen (historique, lien hors panneau) : on referme.
  useEffect(() => {
    close(false)
  }, [pathname, close])

  const linkClass =
    'flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-3"
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        <span className="sr-only sm:not-sr-only">Menu</span>
      </button>

      <div
        className={cn(
          'absolute inset-x-0 top-full h-[calc(100dvh-4rem)]',
          open ? 'visible' : 'invisible pointer-events-none',
        )}
      >
        {/* Voile cliquable : un clic hors du panneau ferme le menu (Échap au clavier). */}
        <div
          aria-hidden="true"
          onClick={() => close(false)}
          className={cn(
            'absolute inset-0 bg-foreground/30 transition-opacity duration-200 ease-out-expo motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          ref={panelRef}
          id={panelId}
          className={cn(
            'relative max-h-full overflow-y-auto overscroll-contain border-b border-border bg-background text-foreground shadow-lg duration-200 ease-out-expo motion-reduce:transition-none',
            // À l'ouverture, `visibility` bascule sans transition : le panneau doit
            // être focalisable immédiatement. À la fermeture, elle attend la fin du
            // fondu pour que le panneau reste visible pendant qu'il disparaît.
            open
              ? 'visible translate-y-0 opacity-100 transition-[opacity,transform]'
              : 'invisible -translate-y-2 opacity-0 transition-[opacity,transform,visibility]',
          )}
        >
          <div className="container py-3">
            <ul className="flex flex-col gap-1">
              {links.map((link) => {
                const current = pathname === link.href
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? 'page' : undefined}
                      onClick={() => close(false)}
                      className={cn(
                        linkClass,
                        current ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
              <Link
                href="/login"
                onClick={() => close(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                onClick={() => close(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-expo hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
