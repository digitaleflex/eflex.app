'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Activity, Bell, FolderKanban, Settings, Users, type LucideIcon } from 'lucide-react'
import { OrgSwitcher } from '@/components/org-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { CommandPalette } from '@/components/command-palette'
import { ThemeToggle } from '@/components/theme-switcher'
import { UserMenu } from '@/components/user-menu'
import { activeDashboardTab, DASHBOARD_TABS, type DashboardTabKey } from '@/lib/dashboard-nav'
import { cn } from '@/lib/utils'

const TAB_ICONS: Record<DashboardTabKey, LucideIcon> = {
  projects: FolderKanban,
  activity: Activity,
  team: Users,
  notifications: Bell,
  settings: Settings,
}

/**
 * Coque de la console : barre du haut (marque, organisation, recherche ⌘K, notifications, compte),
 * onglets soulignés sur ordinateur et barre inférieure sur téléphone.
 *
 * Les deux navigations partagent la même liste (`DASHBOARD_TABS`) et le même calcul de section
 * active (`activeDashboardTab`) : aucune destination ne disparaît d'un format à l'autre.
 */
export function DashboardShell({ children, user }: { children: React.ReactNode; user: { name?: string | null; email?: string | null } }) {
  const pathname = usePathname()
  const activeTab = activeDashboardTab(pathname)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link href="/dashboard" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Image src="/logo-mark.png" alt="Eflex — accueil de la console" width={28} height={28} className="h-7 w-7" priority />
          </Link>
          <span aria-hidden="true" className="hidden select-none text-xl font-light text-border sm:inline">/</span>
          <OrgSwitcher className="min-w-0 max-w-[45vw] sm:max-w-xs" />
          <div className="ml-auto flex items-center gap-2">
            {/* Sur téléphone, le thème reste accessible depuis le menu du compte :
                cela libère la place nécessaire au nom de l'organisation. */}
            <ThemeToggle className="hidden sm:flex" />
            <CommandPalette />
            <NotificationBell />
            <UserMenu name={user.name || 'Mon compte'} email={user.email ?? ''} />
          </div>
        </div>

        <nav aria-label="Navigation principale" className="mx-auto hidden max-w-7xl overflow-x-auto px-2 sm:block sm:px-4">
          <ul className="flex gap-1">
            {DASHBOARD_TABS.map((tab) => {
              const active = tab.key === activeTab
              return (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      active
                        ? 'bg-muted/70 text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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

      {/* Barre inférieure : la navigation reste visible sans défilement horizontal.
          Elle précède le contenu dans le DOM pour que l'ordre clavier reste cohérent. */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {DASHBOARD_TABS.map((tab) => {
            const active = tab.key === activeTab
            const Icon = TAB_ICONS[tab.key]
            return (
              <li key={tab.key} className="min-w-0 flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 pb-2 pt-2.5 text-[10px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-[380px]:text-[11px]',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {active && (
                    <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />
                  )}
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="max-w-full truncate">{tab.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <main id="contenu" tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-28 pt-8 focus:outline-none sm:px-6 sm:pb-8">
        {children}
      </main>
    </div>
  )
}
