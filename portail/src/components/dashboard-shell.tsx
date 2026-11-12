'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Activity, Bell, ChevronsLeft, ChevronsRight, FolderKanban, Gauge, LifeBuoy, Settings, Users, type LucideIcon } from 'lucide-react'
import { OrgSwitcher } from '@/components/org-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { CommandPalette } from '@/components/command-palette'
import { ThemeToggle } from '@/components/theme-switcher'
import { UserMenu } from '@/components/user-menu'
import { activeDashboardTab, DASHBOARD_TABS, type DashboardTabKey } from '@/lib/dashboard-nav'
import { PlanWidget } from '@/components/dashboard/plan-widget'
import { PlatformStatusIndicator } from '@/components/platform-status-indicator'
import type { billingSummary } from '@/lib/billing'
import { cn } from '@/lib/utils'

const TAB_ICONS: Record<DashboardTabKey, LucideIcon> = {
  projects: FolderKanban,
  activity: Activity,
  usage: Gauge,
  team: Users,
  notifications: Bell,
  settings: Settings,
}

const SIDEBAR_COOKIE = 'eflex-sidebar'
const SIDEBAR_STORAGE = 'eflex:sidebar-collapsed'
const AUTO_COLLAPSED_QUERY = '(min-width: 768px) and (max-width: 1023.98px)'

function readStoredCollapsed(): boolean | null {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    // stockage indisponible
  }
  return null
}

function persistCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE, collapsed ? '1' : '0')
  } catch {
    // stockage indisponible
  }
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Coque de la console : barre latérale fixe sur ordinateur (≥ 768 px, repliable, état mémorisé),
 * barre du haut (recherche ⌘K élargie, thème, cloche, compte) et barre inférieure sur téléphone.
 *
 * Les navigations partagent la même liste (`DASHBOARD_TABS`) et le même calcul de section active
 * (`activeDashboardTab`) : aucune destination ne disparaît d'un format à l'autre.
 */
export function DashboardShell({
  children,
  user,
  billing,
  banner,
  initialSidebarCollapsed,
}: {
  children: React.ReactNode
  user: { name?: string | null; email?: string | null }
  billing?: Awaited<ReturnType<typeof billingSummary>> | null
  /** Emplacement unique des bandeaux, affiché sous la barre du haut. */
  banner?: React.ReactNode
  /** Préférence lue côté serveur (cookie) pour éviter un saut à l'hydratation. `undefined` = auto. */
  initialSidebarCollapsed?: boolean
}) {
  const pathname = usePathname()
  const activeTab = activeDashboardTab(pathname)
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(
    initialSidebarCollapsed === undefined ? null : initialSidebarCollapsed,
  )
  const [autoCollapsed, setAutoCollapsed] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(AUTO_COLLAPSED_QUERY)
    const sync = () => setAutoCollapsed(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  // Synchronise la préférence mémorisée (localStorage) avec le cookie serveur si nécessaire.
  useEffect(() => {
    const stored = readStoredCollapsed()
    if (stored !== null) {
      if (initialSidebarCollapsed === undefined || stored !== initialSidebarCollapsed) {
        setCollapsedPref(stored)
        persistCollapsed(stored)
      }
      return
    }
    if (initialSidebarCollapsed !== undefined) {
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE, initialSidebarCollapsed ? '1' : '0')
      } catch {
        // stockage indisponible
      }
    }
  }, [initialSidebarCollapsed])

  const collapsed = collapsedPref ?? autoCollapsed
  const sidebarMode = collapsedPref === null ? 'auto' : collapsedPref ? 'collapsed' : 'expanded'
  const sidebarLabel = collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'

  const toggleSidebar = () => {
    const next = !(collapsedPref ?? autoCollapsed)
    setCollapsedPref(next)
    persistCollapsed(next)
  }

  const navLinkClass = (active: boolean, collapsedNow: boolean) =>
    cn(
      'group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      active ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      collapsedNow && 'md:justify-center md:px-0',
      collapsedPref === null && 'md:max-lg:justify-center md:max-lg:px-0',
    )

  const labelClass = cn(
    'truncate',
    collapsedPref === null ? 'md:max-lg:hidden' : collapsed ? 'md:hidden' : '',
  )

  const sectionTitleClass = cn(
    'px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
    collapsedPref === null ? 'md:max-lg:hidden' : collapsed ? 'md:hidden' : '',
  )

  const resources = useMemo(
    () => [{ href: '/dashboard/support', label: 'Support', icon: LifeBuoy }],
    [],
  )

  return (
    <div className="min-h-screen" data-sidebar={sidebarMode}>
      {/* Barre latérale (bureau) */}
      <aside
        aria-label="Barre latérale"
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-card md:flex md:flex-col',
          collapsedPref === null ? 'md:w-16 lg:w-60' : collapsedPref ? 'md:w-16' : 'md:w-60',
        )}
      >
        <div className={cn('flex h-14 items-center border-b border-border px-3', collapsedPref === null ? 'md:max-lg:justify-center md:max-lg:px-0' : collapsed ? 'md:justify-center md:px-0' : '')}>
          <Link href="/dashboard" className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Eflex — accueil de la console">
            <Image src="/logo-mark.png" alt="Eflex — accueil de la console" width={28} height={28} className="h-7 w-7 shrink-0" priority />
            <span className={cn('text-sm font-semibold text-foreground', labelClass)}>Eflex</span>
          </Link>
        </div>

        <div className={cn('border-b border-border p-2', collapsedPref === null ? 'md:max-lg:hidden' : collapsed ? 'md:hidden' : '')}>
          <OrgSwitcher className="w-full" />
          {billing && <PlanWidget billing={billing} className="mt-2 w-full" />}
        </div>
        <div className={cn('hidden border-b border-border p-2', collapsedPref === null ? 'md:max-lg:flex md:max-lg:justify-center' : collapsed ? 'md:flex md:justify-center' : '')}>
          <Link
            href="/dashboard/organization"
            title="Organisation et abonnement"
            aria-label="Organisation et abonnement"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Users className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-1">
            {DASHBOARD_TABS.map((tab) => {
              const active = tab.key === activeTab
              const Icon = TAB_ICONS[tab.key]
              return (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    title={tab.label}
                    className={navLinkClass(active, collapsed)}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className={labelClass}>{tab.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <p className={sectionTitleClass}>Ressources</p>
          <ul className="flex flex-col gap-1">
            {resources.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                    className={navLinkClass(active, collapsed)}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className={labelClass}>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className={cn('mt-auto border-t border-border p-2', collapsedPref === null ? 'md:max-lg:flex md:max-lg:flex-col md:max-lg:items-center' : collapsed ? 'md:flex md:flex-col md:items-center' : '')}>
          <div className={cn('mb-1 px-1', collapsedPref === null ? 'md:max-lg:hidden' : collapsed ? 'md:hidden' : '')}>
            <PlatformStatusIndicator />
          </div>
          <div className={cn('mb-1 hidden', collapsedPref === null ? 'md:max-lg:block' : collapsed ? 'md:block' : '')}>
            <PlatformStatusIndicator className="[&_span:not(:first-child)]:sr-only" />
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarLabel}
            aria-expanded={!collapsed}
            title={sidebarLabel}
            className={cn(
              'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              collapsedPref === null ? 'md:max-lg:w-11 md:max-lg:justify-center md:max-lg:px-0' : collapsed ? 'md:w-11 md:justify-center md:px-0' : '',
            )}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ChevronsLeft className="h-5 w-5 shrink-0" aria-hidden="true" />}
            <span className={labelClass}>{collapsed ? 'Déplier' : 'Replier'}</span>
          </button>
        </div>
      </aside>

      {/* Colonne principale décalée par la barre latérale sur bureau */}
      <div className={cn('flex min-h-screen flex-col', collapsedPref === null ? 'md:pl-16 lg:pl-60' : collapsedPref ? 'md:pl-16' : 'md:pl-60')}>
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <Link href="/dashboard" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
              <Image src="/logo-mark.png" alt="Eflex — accueil de la console" width={28} height={28} className="h-7 w-7" priority />
            </Link>
            <span aria-hidden="true" className="hidden select-none text-xl font-light text-border sm:inline md:hidden">/</span>
            <OrgSwitcher className="min-w-0 max-w-[45vw] sm:max-w-xs md:hidden" />

            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:ml-0 md:justify-between">
              <div className="hidden min-w-0 flex-1 md:block md:max-w-xl lg:max-w-2xl">
                <CommandPalette className="w-full sm:w-full" />
              </div>
              <div className="flex items-center gap-2">
                <div className="md:hidden">
                  <CommandPalette hotkey={false} />
                </div>
                {/* Sur téléphone, le thème reste accessible depuis le menu du compte. */}
                <ThemeToggle className="hidden sm:flex" />
                <NotificationBell />
                <UserMenu name={user.name || 'Mon compte'} email={user.email ?? ''} />
              </div>
            </div>
          </div>
        </header>

        {banner ? (
          <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
            {banner}
          </div>
        ) : null}

        {/* Barre inférieure mobile : mêmes destinations que les onglets de la barre latérale. */}
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden"
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

        <main id="contenu" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 pb-28 pt-8 focus:outline-none sm:px-6 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}
