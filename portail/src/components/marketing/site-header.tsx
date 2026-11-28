'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'

const links = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/docs', label: 'Documentation' },
  { href: '/tarifs', label: 'Tarifs' },
]

function isCurrent(pathname: string, href: string) {
  if (href.startsWith('/#')) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}

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
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <nav
        aria-label="Navigation du site"
        className="container flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]"
      >
        <Link
          href="/"
          className="group inline-flex min-h-11 shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandLogo
            alt="EFLEX — accueil"
            className="h-6 w-auto transition-opacity duration-200 ease-out-expo group-hover:opacity-90 sm:h-7 lg:h-8"
            priority
          />
        </Link>

        <ul className="hidden items-center gap-1 rounded-full border border-border/60 bg-muted/30 p-1 lg:flex">
          {links.map((link) => {
            const active = isCurrent(pathname, link.href)
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-[color,background-color] duration-200 ease-out-expo hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Connexion
          </Link>

          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-5"
          >
            <span>Créer un compte</span>
            <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
          </Link>

          <button
            ref={buttonRef}
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-[background-color,border-color,color] duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
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
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
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
            className="absolute inset-x-3 top-3 rounded-3xl border border-border/70 bg-card/95 p-4 shadow-xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Navigation</p>
                <p className="text-xs text-muted-foreground">EFLEX</p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Fermer le menu"
                onClick={closeMenu}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <ul className="mt-4 space-y-1">
              {links.map((link) => {
                const active = isCurrent(pathname, link.href)
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeMenu}
                      className={cn(
                        'flex min-h-11 items-center justify-between rounded-2xl px-4 text-base font-medium transition-[background-color,color] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <span>{link.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
                    </Link>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 grid gap-2 border-t border-border pt-4">
              <Link
                href="/login"
                onClick={closeMenu}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-input px-4 text-sm font-semibold text-foreground transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                onClick={closeMenu}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-200 ease-out-expo hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Créer un compte
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
