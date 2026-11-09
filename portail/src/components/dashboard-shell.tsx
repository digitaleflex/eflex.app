'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { OrgSwitcher } from '@/components/org-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { CommandPalette } from '@/components/command-palette'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Projets', href: '/dashboard', match: (p: string) => p === '/dashboard' || p.startsWith('/dashboard/projects') || p === '/dashboard/new' },
  { label: 'Activité', href: '/dashboard/activity', match: (p: string) => p.startsWith('/dashboard/activity') },
  { label: 'Équipe', href: '/dashboard/organization', match: (p: string) => p.startsWith('/dashboard/organization') },
  { label: 'Notifications', href: '/dashboard/notifications', match: (p: string) => p.startsWith('/dashboard/notifications') },
  { label: 'Paramètres', href: '/dashboard/settings', match: (p: string) => p.startsWith('/dashboard/settings') },
]

/**
 * Coque de la console : barre du haut (marque, organisation, recherche ⌘K, notifications, compte)
 * et onglets soulignés. Une seule navigation, la même sur téléphone et sur ordinateur.
 */
export function DashboardShell({ children, user }: { children: React.ReactNode; user: { name?: string | null; email?: string | null } }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Image src="/logo-mark.png" alt="Eflex — accueil de la console" width={28} height={28} className="h-7 w-7" priority />
          </Link>
          <span aria-hidden="true" className="select-none text-xl font-light text-border">/</span>
          <OrgSwitcher className="min-w-0 max-w-[45vw] sm:max-w-xs" />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            <NotificationBell />
            <UserMenu name={user.name || 'Mon compte'} email={user.email ?? ''} />
          </div>
        </div>
        <nav aria-label="Navigation principale" className="mx-auto max-w-7xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex gap-1">
            {TABS.map((tab) => {
              const active = tab.match(pathname)
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      active ? 'text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      <main id="contenu" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-8 focus:outline-none sm:px-6">
        {children}
      </main>
    </div>
  )
}
