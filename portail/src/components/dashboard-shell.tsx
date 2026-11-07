'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { CreditCard, FolderKanban, LogOut, Plus, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'
import { OrgSwitcher } from '@/components/org-switcher'

type NavItem = {
  label: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  match?: (pathname: string) => boolean
}

const navigation: NavItem[] = [
  {
    label: 'Projets',
    href: '/dashboard',
    icon: FolderKanban,
    match: (p) => p === '/dashboard' || p.startsWith('/dashboard/projects'),
  },
  { label: 'Nouveau', href: '/dashboard/new', icon: Plus, match: (p) => p === '/dashboard/new' },
  { label: 'Équipe', href: '/dashboard/organization', icon: Users, match: (p) => p.startsWith('/dashboard/organization') },
  // Pas encore de page : affichés comme « Bientôt » plutôt que comme des liens morts.
  { label: 'Facturation', icon: CreditCard },
  { label: 'Paramètres', icon: Settings },
]

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode
  user: { name?: string | null; email?: string | null }
}) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex">
      {/* Barre latérale (desktop) */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-muted/30">
        <div className="flex items-center h-16 px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center">
            <Image src="/logo-horizontal.webp" alt="Eflex — tableau de bord" width={1200} height={312} className="h-8 w-auto" priority />
          </Link>
        </div>
        <OrgSwitcher className="px-4 pt-4" />
        <nav aria-label="Navigation principale" className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            if (!item.href) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground/70 cursor-not-allowed"
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                  <span className="ml-auto text-[10px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5">Bientôt</span>
                </span>
              )
            }
            const active = item.match?.(pathname) ?? pathname === item.href
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-border space-y-3">
          <div className="px-3 min-w-0">
            <p className="text-sm font-medium truncate">{user.name || 'Mon compte'}</p>
            {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Déconnexion
          </Button>
        </div>
      </aside>

      {/* En-tête (mobile) */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 glass border-b border-border">
        <div className="flex items-center justify-between h-14 px-4">
          <Link href="/dashboard" className="flex items-center">
            <Image src="/logo-horizontal.webp" alt="Eflex — tableau de bord" width={1200} height={312} className="h-7 w-auto" />
          </Link>
          <Button variant="ghost" size="sm" className="h-11 text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Déconnexion
          </Button>
        </div>
        <OrgSwitcher className="px-4 pb-2" />
      </div>

      {/* Navigation basse (mobile) */}
      <nav aria-label="Navigation principale" className="lg:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-border">
        <div className="flex items-center justify-around h-16 px-2">
          {navigation.filter((item) => item.href).map((item) => {
            const Icon = item.icon
            const active = item.match?.(pathname) ?? pathname === item.href
            return (
              <Link
                key={item.label}
                href={item.href!}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 min-w-16 min-h-11 px-3 rounded-lg text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <main className="flex-1 min-w-0 pt-28 pb-20 lg:pt-0 lg:pb-0">
        <div className="container py-8">{children}</div>
      </main>
    </div>
  )
}
