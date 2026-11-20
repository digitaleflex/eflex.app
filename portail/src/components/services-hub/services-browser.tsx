'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { ServiceIcon } from '@/components/service-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SERVICE_CATEGORIES } from '@/lib/managed-services-catalog'
import {
  CATEGORY_ORDER,
  FILTER_LABELS,
  STATE_LABELS,
  STATE_TONES,
  matchesServiceQuery,
  type ServiceFilterState,
  type UnifiedService,
} from '@/lib/services-hub'
import type { ServiceCategory } from '@/lib/managed-services-catalog'

const BADGE_TONE: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  info: 'bg-info/10 text-info border-info/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  muted: 'bg-muted text-muted-foreground border-border',
}

const FILTERS: ServiceFilterState[] = ['provisionable', 'added', 'unavailable', 'coolify-oneclick', 'eflex-managed', 'planned']

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function ServicesBrowser({
  services,
  canManage,
  onOpen,
}: {
  services: UnifiedService[]
  canManage: boolean
  onOpen: (service: UnifiedService) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ServiceCategory | 'all'>('all')
  const [states, setStates] = useState<Set<ServiceFilterState>>(new Set())

  const filtered = useMemo(() => {
    return services.filter((service) => {
      if (category !== 'all' && service.category !== category) return false
      if (states.size > 0 && !service.filterTags.some((tag) => states.has(tag))) return false
      if (!matchesServiceQuery(service, query)) return false
      return true
    })
  }, [services, category, states, query])

  const hasFilters = query.trim() !== '' || category !== 'all' || states.size > 0

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-sm">
            <Input
              id="services-search"
              label="Rechercher un service"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="PostgreSQL, cache, recherche, vecteur…"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length} service{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Catégorie</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par catégorie">
            <button
              type="button"
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
              className={cn(
                'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                category === 'all' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Toutes
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  category === c ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {SERVICE_CATEGORIES[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Disponibilité</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par disponibilité">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={states.has(filter)}
                onClick={() => setStates((s) => toggle(s, filter))}
                className={cn(
                  'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  states.has(filter) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {FILTER_LABELS[filter]}
              </button>
            ))}
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setStates(new Set())
                }}
                className="min-h-11 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Search className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm text-muted-foreground">Aucun service ne correspond à votre recherche ou aux filtres.</p>
          {hasFilters && (
            <div className="mt-3 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setStates(new Set())
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((service) => {
            const canProvision = service.state === 'creatable' && canManage
            const actionableDb = canProvision && Boolean(service.managedDatabaseKind)
            return (
              <li key={service.key} className="rounded-lg border border-border p-3">
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <ServiceIcon kind={service.icon} label={service.label} className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{service.label}</p>
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', BADGE_TONE[STATE_TONES[service.state]])}>
                          {STATE_LABELS[service.state]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{service.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{SERVICE_CATEGORIES[service.category]}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {service.envKey && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{service.envKey}</span>
                    )}
                    {service.envAliases.length > 0 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={service.envAliases.join(', ')}>
                        +{service.envAliases.length} alias
                      </span>
                    )}
                    {service.managedDatabaseKind && service.backupSupported && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Sauvegarde intégrée</span>
                    )}
                    {service.managedDatabaseKind && !service.backupSupported && service.state !== 'unavailable' && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Sans sauvegarde intégrée</span>
                    )}
                    {service.provider && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        via {service.provider === 'coolify' ? 'Coolify' : 'EFLEX'}
                      </span>
                    )}
                  </div>

                  {service.reason && <p className="text-xs text-warning">{service.reason}</p>}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-muted-foreground">
                      {service.state === 'active' && 'Ressource active'}
                      {service.state === 'creatable' && !canManage && 'Lecture seule'}
                      {service.state === 'unavailable' && 'Non disponible ici'}
                      {(service.state === 'coolify-oneclick' || service.state === 'eflex-managed' || service.state === 'planned') && 'Non provisionnable pour le moment'}
                    </p>
                    <Button type="button" variant={canProvision ? 'outline' : 'ghost'} size="sm" onClick={() => onOpen(service)}>
                      {actionableDb ? 'Configurer' : canProvision ? 'Provisionner' : service.state === 'active' ? 'Voir' : 'Détails'}
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
