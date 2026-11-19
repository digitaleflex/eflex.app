'use client'

import { ServiceIcon } from '@/components/service-icon'
import {
  MANAGED_SERVICES_CATALOG,
  SERVICE_AVAILABILITY,
  SERVICE_CATEGORIES,
  type ManagedServiceEntry,
  type ServiceCategory,
} from '@/lib/managed-services-catalog'
import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  info: 'bg-info/10 text-info border-info/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  muted: 'bg-muted text-muted-foreground border-border',
}

const ORDER: ServiceCategory[] = ['database', 'cache', 'storage', 'search', 'messaging', 'vector', 'observability', 'backend']

function groupByCategory(items: readonly ManagedServiceEntry[]) {
  const map = new Map<ServiceCategory, ManagedServiceEntry[]>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return ORDER.map((category) => ({ category, items: map.get(category) ?? [] })).filter((g) => g.items.length > 0)
}

/** Catalogue indexé des services managés (disponibles, Coolify one-click, EFLEX-gérés/planifiés). */
export function ManagedServicesCatalog() {
  const groups = groupByCategory(MANAGED_SERVICES_CATALOG)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Catalogue de services (index)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Bases et services managés : disponibles maintenant, exposables via Coolify (one-click) ou ajoutables en
          service EFLEX-géré pour rester à la pointe (stockage objet, recherche, messaging, vectoriel/IA, etc.).
        </p>
      </div>

      <div className="space-y-5">
        {groups.map(({ category, items }) => (
          <section key={category} aria-label={SERVICE_CATEGORIES[category]} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {SERVICE_CATEGORIES[category]}
            </h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((item) => {
                const avail = SERVICE_AVAILABILITY[item.availability]
                return (
                  <li key={item.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start gap-3">
                      <ServiceIcon kind={item.icon} label={item.label} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.label}</p>
                          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', TONE[avail.tone])}>
                            {avail.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                        {item.notes && <p className="mt-1 text-xs text-muted-foreground">• {item.notes}</p>}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
