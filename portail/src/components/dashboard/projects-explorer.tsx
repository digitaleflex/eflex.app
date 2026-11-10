'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import { ProjectCard, ProjectRow } from '@/components/dashboard/project-card'
import { attentionRank, statusInfo } from '@/lib/project-status'
import type { DashboardProject } from '@/lib/dashboard-data'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'live' | 'active' | 'failed'
type Sort = 'recent' | 'name' | 'status'
type View = 'grid' | 'list'

const FILTERS: { id: Filter; label: string; test: (p: DashboardProject) => boolean }[] = [
  { id: 'all', label: 'Tous', test: () => true },
  { id: 'live', label: 'En ligne', test: (p) => p.lastStatus === 'live' },
  { id: 'active', label: 'En cours', test: (p) => statusInfo(p.lastStatus).inProgress },
  { id: 'failed', label: 'En échec', test: (p) => p.lastStatus === 'failed' },
]

const VIEW_KEY = 'eflex.projects.view'

export function ProjectsExplorer({ projects }: { projects: DashboardProject[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [view, setView] = useState<View>('grid')
  const searchId = useId()
  const sortId = useId()

  // Préférence d'affichage propre à ce navigateur (jamais indispensable).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY)
      if (saved === 'grid' || saved === 'list') setView(saved)
    } catch { /* stockage indisponible */ }
  }, [])
  const chooseView = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* stockage indisponible */ }
  }

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, projects.filter(f.test).length])) as Record<Filter, number>, [projects])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const test = FILTERS.find((f) => f.id === filter)!.test
    const list = projects.filter((p) => test(p) && (!q || [p.name, p.domain ?? '', p.repoUrl, p.framework ?? ''].some((v) => v.toLowerCase().includes(q))))
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'fr') : sort === 'status' ? attentionRank(a.lastStatus) - attentionRank(b.lastStatus) || a.name.localeCompare(b.name, 'fr') : (b.lastAt ?? b.updatedAt).localeCompare(a.lastAt ?? a.updatedAt),
    )
  }, [projects, query, filter, sort])

  return (
    <section aria-labelledby="projects-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="projects-title" className="sr-only">Projets</h2>
        <div className="relative min-w-0 flex-[1_1_16rem]">
          <label htmlFor={searchId} className="sr-only">Rechercher un projet</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un projet, un domaine, un dépôt…"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filtrer par statut" className="flex rounded-lg border border-border bg-card p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10',
                  filter === f.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
                <span className={cn('tabular-nums', filter === f.id ? 'text-background/70' : 'text-muted-foreground/80')}>{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label htmlFor={sortId} className="sr-only">Trier les projets</label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
          >
            <option value="recent">Activité récente</option>
            <option value="status">À regarder d&apos;abord</option>
            <option value="name">Nom (A → Z)</option>
          </select>
          <div role="group" aria-label="Affichage" className="flex rounded-lg border border-border bg-card p-0.5">
            {([['grid', LayoutGrid, 'Grille'], ['list', List, 'Liste']] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => chooseView(v)}
                className={cn('flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10', view === v ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
          <Link
            href="/dashboard/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau projet
          </Link>
        </div>
      </div>

      <p role="status" className="sr-only">{visible.length} projet{visible.length > 1 ? 's' : ''} affiché{visible.length > 1 ? 's' : ''}</p>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="font-display text-lg font-semibold">Mettez votre premier projet en ligne</p>
          <p className="max-w-md text-sm text-muted-foreground">Indiquez un dépôt GitHub : Eflex reconnaît la stack, construit l&apos;application et la publie avec son adresse.</p>
          <Link href="/dashboard/new" className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Importer un dépôt
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-medium">Aucun projet ne correspond</p>
          <p className="mt-1 text-sm text-muted-foreground">Essayez un autre mot ou affichez tous les statuts.</p>
          <button type="button" onClick={() => { setQuery(''); setFilter('all') }} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">
            Effacer la recherche et les filtres
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((p) => <ProjectRow key={p.id} project={p} />)}
        </ul>
      )}
    </section>
  )
}
