'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, ArrowLeft, LayoutDashboard, ScrollText, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectionBadge } from '@/components/connection-badge'

const NAV = [
  { label: "Vue d'ensemble", href: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Utilisateurs', href: '/admin/users', icon: Users },
  { label: 'Journal d’audit', href: '/admin/audit', icon: ScrollText },
  { label: 'Infrastructure', href: '/admin/infra', icon: Activity, soon: true },
] as const

export function AdminShell({ children, email }: { children: React.ReactNode; email: string }) {
  const pathname = usePathname()
  const isActive = (item: (typeof NAV)[number]) => ('exact' in item && item.exact ? pathname === item.href : pathname.startsWith(item.href))

  return (
    <div className="min-h-screen">
      <div role="note" className="bg-eflexnavy px-4 py-2 text-center text-xs font-medium text-white">
        Zone d&apos;administration — chaque action est enregistrée dans le journal d&apos;audit.
      </div>
      <div className="flex flex-col lg:flex-row">
        <aside className="border-b border-border bg-muted/30 lg:min-h-[calc(100vh-2.25rem)] lg:w-60 lg:border-b-0 lg:border-r">
          <nav aria-label="Administration" className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:p-4">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = isActive(item)
              if ('soon' in item) {
                return (
                  <span key={item.href} aria-disabled="true" className="flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground cursor-not-allowed">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                    <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] uppercase">Bientôt</span>
                  </span>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="hidden border-t border-border p-4 lg:block">
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            <ConnectionBadge className="mt-2" />
            <Link href="/dashboard" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour à la console
            </Link>
          </div>
        </aside>
        <main id="contenu" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-8 focus:outline-none">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
