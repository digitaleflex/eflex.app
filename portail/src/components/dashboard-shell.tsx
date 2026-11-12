'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Activity,
  Bell,
  Building2,
  FolderKanban,
  Gauge,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { OrgSwitcher } from '@/components/org-switcher'
import { NotificationBell } from '@/components/notification-bell'
import { CommandPalette } from '@/components/command-palette'
import { ThemeToggle } from '@/components/theme-switcher'
import { UserMenu } from '@/components/user-menu'
import { useConnectionState } from '@/hooks/events-provider'
import { activeDashboardTab, DASHBOARD_TABS, type DashboardTabKey } from '@/lib/dashboard-nav'
import { planUsage } from '@/lib/plan-usage'
import { cn } from '@/lib/utils'

const TAB_ICONS: Record<DashboardTabKey, LucideIcon> = {
  projects: FolderKanban,
  activity: Activity,
  team: Users,
  notifications: Bell,
  settings: Settings,
}

/** Résumé du plan de l'organisation, calculé côté serveur (réservé aux rôles de facturation). */
export interface SidebarPlan {
  label: string
  used: number
  limit: number
  /** Faux pour le plus haut plan : il n'y a plus de « Mettre à niveau » à proposer. */
  upgradable: boolean
}

const STORAGE_KEY = 'eflex.sidebar'

/** Préférence propre à ce navigateur : jamais indispensable, le stockage peut être indisponible. */
function readCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'collapsed') return true
    if (saved === 'expanded') return false
  } catch { /* stockage indisponible */ }
  // Sans préférence : on replie sur tablette pour laisser la place au contenu.
  return window.matchMedia('(max-width: 1023px)').matches
}

const navLink =
  'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function PlanCard({ plan, collapsed }: { plan: SidebarPlan; collapsed: boolean }) {
  const usage = planUsage(plan.used, plan.limit)
  const bar = usage.tone === 'full' ? 'bg-destructive' : usage.tone === 'warning' ? 'bg-warning' : 'bg-primary'

  if (collapsed) {
    return (
      <Link
        href="/dashboard/organization"
        title={`Plan ${plan.label} : ${usage.label}`}
        className={cn(navLink, 'justify-center px-0 text-muted-foreground hover:bg-muted hover:text-foreground')}
      >
        <Gauge className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Plan {plan.label} : {usage.label}</span>
      </Link>
    )
  }

  return (
    <section aria-labelledby="sidebar-plan" className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="sidebar-plan" className="text-sm font-semibold">Votre plan</h2>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium">{plan.label}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Applications</p>
      <p className="text-sm font-semibold tabular-nums">{usage.label}</p>
      <div
        role="progressbar"
        aria-label="Quota d’applications"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usage.percent}
        aria-valuetext={usage.label}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', bar)} style={{ width: `${usage.percent}%` }} />
      </div>
      {usage.tone !== 'ok' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {usage.tone === 'full' ? 'Quota atteint : plus de nouveau projet possible.' : 'Vous approchez de la limite du plan.'}
        </p>
      )}
      <Link
        href="/dashboard/organization"
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {plan.upgradable ? 'Mettre à niveau' : 'Gérer l’abonnement'}
      </Link>
    </section>
  )
}

/** Indicateur du flux temps réel (celui qui met la console à jour), pas l'état de l'infrastructure. */
function LiveStatus({ collapsed }: { collapsed: boolean }) {
  const connection = useConnectionState()
  if (!connection) return null
  const label = connection === 'live' ? 'Mises à jour en direct' : connection === 'ended' ? 'Hors ligne' : 'Reconnexion…'
  return (
    <p className={cn('flex items-center gap-2 px-3 text-xs text-muted-foreground', collapsed && 'justify-center px-0')} title={collapsed ? label : undefined}>
      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', connection === 'live' ? 'bg-success' : connection === 'ended' ? 'bg-destructive' : 'bg-warning')} />
      <span className={collapsed ? 'sr-only' : undefined}>{label}</span>
    </p>
  )
}

/**
 * Coque de la console : barre latérale repliable (≥ 768 px), barre du haut (recherche ⌘K,
 * thème, notifications, compte) et barre inférieure sur téléphone.
 *
 * Toutes les navigations partagent la même liste (`DASHBOARD_TABS`) et le même calcul de section
 * active (`activeDashboardTab`) : aucune destination ne disparaît d'un format à l'autre.
 */
export function DashboardShell({
  children,
  user,
  plan,
}: {
  children: React.ReactNode
  user: { name?: string | null; email?: string | null }
  plan?: SidebarPlan | null
}) {
  const pathname = usePathname()
  const activeTab = activeDashboardTab(pathname)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => setCollapsed(readCollapsed()), [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded') } catch { /* stockage indisponible */ }
  }

  const supportActive = pathname.startsWith('/dashboard/support')
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <div className="min-h-screen">
      <aside
        id="barre-laterale"
        aria-label="Barre latérale"
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card transition-[width] duration-200 ease-out-expo motion-reduce:transition-none md:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center gap-2 border-b border-border', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/dashboard" className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Image src="/logo-mark.png" alt="Eflex — accueil de la console" width={28} height={28} className="h-7 w-7 shrink-0" priority />
            {!collapsed && <span className="font-display text-lg font-bold tracking-tight">Eflex</span>}
          </Link>
        </div>

        <div className={cn('shrink-0 px-3 pt-3', collapsed && 'px-2')}>
          {collapsed ? (
            <button
              type="button"
              onClick={toggle}
              title="Changer d’organisation : déplier la barre latérale"
              className="flex h-10 w-full items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Building2 className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Changer d’organisation : déplier la barre latérale</span>
            </button>
          ) : (
            <OrgSwitcher className="w-full rounded-lg border border-border bg-background" />
          )}
        </div>

        <nav aria-label="Navigation principale" className={cn('flex-1 overflow-y-auto px-3 py-3', collapsed && 'px-2')}>
          <ul className="space-y-1">
            {DASHBOARD_TABS.map((tab) => {
              const active = tab.key === activeTab
              const Icon = TAB_ICONS[tab.key]
              return (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? tab.label : undefined}
                    className={cn(
                      navLink,
                      collapsed && 'justify-center px-0',
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className={collapsed ? 'sr-only' : 'truncate'}>{tab.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 border-t border-border pt-4">
            {!collapsed && <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">Ressources</p>}
            <Link
              href="/dashboard/support"
              aria-current={supportActive ? 'page' : undefined}
              title={collapsed ? 'Support' : undefined}
              className={cn(
                navLink,
                collapsed && 'justify-center px-0',
                supportActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <LifeBuoy className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={collapsed ? 'sr-only' : 'truncate'}>Support</span>
            </Link>
          </div>
        </nav>

        <div className={cn('shrink-0 space-y-3 border-t border-border p-3', collapsed && 'px-2')}>
          {plan && <PlanCard plan={plan} collapsed={collapsed} />}
          <LiveStatus collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="barre-laterale"
            title={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            className={cn(navLink, 'w-full text-muted-foreground hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}
          >
            <ToggleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className={collapsed ? 'sr-only' : 'truncate'}>{collapsed ? 'Déplier la barre latérale' : 'Replier'}</span>
          </button>
        </div>
      </aside>

      <div className={cn('transition-[padding-left] duration-200 ease-out-expo motion-reduce:transition-none', collapsed ? 'md:pl-[4.5rem]' : 'md:pl-64')}>
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
            {/* Téléphone : la marque et l'organisation, la barre latérale n'existe pas. */}
            <Link href="/dashboard" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
              <Image src="/logo-mark.png" alt="Eflex — accueil de la console" width={28} height={28} className="h-7 w-7" />
            </Link>
            <OrgSwitcher className="min-w-0 max-w-[45vw] sm:max-w-xs md:hidden" />
            <CommandPalette className="sm:w-56 md:w-full md:max-w-md" />
            <div className="ml-auto flex items-center gap-2">
              {/* Sur téléphone, le thème reste accessible depuis le menu du compte. */}
              <ThemeToggle className="hidden sm:flex" />
              <NotificationBell />
              <UserMenu name={user.name || 'Mon compte'} email={user.email ?? ''} />
            </div>
          </div>
        </header>

        {/* Barre inférieure : la navigation reste visible sans défilement horizontal.
            Elle précède le contenu dans le DOM pour que l'ordre clavier reste cohérent. */}
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

        <main id="contenu" tabIndex={-1} className="mx-auto max-w-7xl px-4 pb-28 pt-8 focus:outline-none sm:px-6 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}
