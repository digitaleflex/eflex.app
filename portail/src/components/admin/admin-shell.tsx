'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  Building2,
  CreditCard,
  FolderGit2,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Radio,
  Rocket,
  ScrollText,
  Server,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectionBadge } from '@/components/connection-badge'

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  exact?: boolean
  soon?: boolean
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Pilotage',
    items: [
      { label: "Vue d'ensemble", href: '/admin', icon: LayoutDashboard, exact: true },
      { label: 'Activité en direct', href: '/admin/live', icon: Radio },
      { label: 'Surveillance des sites', href: '/admin/monitoring', icon: Activity },
      { label: "Journal d'audit", href: '/admin/audit', icon: ScrollText },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { label: 'Déploiements', href: '/admin/deployments', icon: Rocket },
      { label: 'Projets', href: '/admin/projects', icon: FolderGit2 },
    ],
  },
  {
    title: 'Clients',
    items: [
      { label: 'Utilisateurs', href: '/admin/users', icon: Users },
      { label: 'Organisations', href: '/admin/organizations', icon: Building2 },
      { label: 'Paiements', href: '/admin/payments', icon: CreditCard },
      { label: 'Support', href: '/admin/support', icon: LifeBuoy },
    ],
  },
  {
    title: 'Plateforme',
    items: [{ label: 'Infrastructure', href: '/admin/infrastructure', icon: Server }],
  },
]

function isActivePath(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const Icon = item.icon
              const active = isActivePath(pathname, item)
              if (item.soon) {
                return (
                  <li key={item.href}>
                    <span
                      aria-disabled="true"
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground cursor-not-allowed"
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs uppercase">Bientôt</span>
                    </span>
                  </li>
                )
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ShellFooter({ email }: { email: string }) {
  return (
    <div className="border-t border-border p-4">
      <p className="truncate text-xs text-muted-foreground">{email}</p>
      <ConnectionBadge className="mt-2" />
      <Link
        href="/dashboard"
        className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour à la console
      </Link>
    </div>
  )
}

export function AdminShell({ children, email }: { children: React.ReactNode; email: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuId = useId()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <div className="min-h-screen">
      <div role="note" className="bg-eflexnavy px-4 py-2 text-center text-xs font-medium text-white">
        Zone d&apos;administration — chaque action est enregistrée dans le journal d&apos;audit.
      </div>
      <div className="flex flex-col lg:flex-row">
        <aside className="hidden border-border bg-muted/30 lg:flex lg:min-h-[calc(100vh-2.25rem)] lg:w-64 lg:shrink-0 lg:flex-col lg:border-r">
          <nav aria-label="Administration" className="flex-1 overflow-y-auto p-4">
            <NavLinks pathname={pathname} />
          </nav>
          <ShellFooter email={email} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls={menuId}
              aria-label="Ouvrir le menu d'administration"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-foreground">Administration</span>
          </div>

          {open ? (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Fermer le menu"
                className="absolute inset-0 bg-black/50"
                onClick={() => setOpen(false)}
              />
              <div
                id={menuId}
                role="dialog"
                aria-modal="true"
                aria-label="Menu d'administration"
                className="absolute inset-y-0 left-0 flex w-full max-w-xs flex-col border-r border-border bg-background shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">Administration</span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fermer le menu"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <nav aria-label="Administration" className="flex-1 overflow-y-auto p-4">
                  <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
                </nav>
                <ShellFooter email={email} />
              </div>
            </div>
          ) : null}

          <main id="contenu" tabIndex={-1} className="p-4 focus:outline-none sm:p-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
