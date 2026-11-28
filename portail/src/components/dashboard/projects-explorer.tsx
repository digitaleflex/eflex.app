'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FolderKanban, LayoutGrid, List, Plus, Search, SearchX } from 'lucide-react'
import { ProjectCard } from '@/components/dashboard/project-card'
import { ProjectsTable } from '@/components/dashboard/projects-table'
import { EmptyPanel } from '@/components/dashboard/section'
import { LinkButton } from '@/components/link-button'
import { isSearchShortcut } from '@/lib/search-shortcut'
import {
  PROJECT_FILTERS,
  PROJECT_SORTS,
  PROJECT_SORT_HINTS,
  projectFilterCounts,
  selectProjects,
  type ProjectFilter,
  type ProjectSort,
} from '@/lib/project-explorer'
import type { DashboardProject } from '@/lib/dashboard-data'
import { cn } from '@/lib/utils'

type View = 'grid' | 'list'

const VIEW_KEY = 'eflex.projects.view'

const countLabel = (n: number) => `${n} projet${n > 1 ? 's' : ''}`

export function ProjectsExplorer({
  projects,
  canManage,
  initialSort = 'recent',
}: {
  projects: DashboardProject[]
  /** Créer un projet exige un rôle gestionnaire (owner/admin). */
  canManage: boolean
  /** « À regarder d’abord » quand des projets demandent une action. */
  initialSort?: ProjectSort
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [sort, setSort] = useState<ProjectSort>(initialSort)
  const [view, setView] = useState<View>('list')
  const searchId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const sortId = useId()

  // Préférence d'affichage propre à ce navigateur (jamais indispensable).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY)
      if (saved === 'grid' || saved === 'list') setView(saved)
    } catch { /* stockage indisponible */ }
  }, [])
  // Raccourci « / » : place le curseur dans la recherche (jamais pendant une saisie).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const chooseView = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* stockage indisponible */ }
  }

  const counts = useMemo(() => projectFilterCounts(projects), [projects])
  const visible = useMemo(
    () => selectProjects(projects, { query, filter, sort }),
    [projects, query, filter, sort],
  )
  const filtered = query.trim() !== '' || filter !== 'all'
  const showControls = projects.length > 4 || filtered

  return (
    <section aria-labelledby="projects-title" className="space-y-3">
      <h2 id="projects-title" className="sr-only">Projets</h2>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {showControls ? (
            <div className="relative min-w-0 sm:min-w-[12rem] sm:flex-[1_1_16rem]">
              <label htmlFor={searchId} className="sr-only">Rechercher un projet</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id={searchId}
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un projet…"
                aria-keyshortcuts="/"
                className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
              />
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded-md border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground [@media(pointer:fine)]:inline-flex"
              >
                /
              </kbd>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                {countLabel(projects.length)} dans votre espace
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {showControls && (
              <>
                <div
                  role="group"
                  aria-label="Filtrer par statut"
                  className="flex min-w-0 max-w-full overflow-x-auto rounded-lg border border-border bg-card p-0.5 [scrollbar-width:none]"
                >
                  {PROJECT_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={filter === item.id}
                      onClick={() => setFilter(item.id)}
                      className={cn(
                        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11',
                        filter === item.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {item.label}
                      <span className={cn('tabular-nums', filter === item.id ? 'text-background/70' : 'text-muted-foreground/80')}>
                        {counts[item.id]}
                      </span>
                    </button>
                  ))}
                </div>

                <label htmlFor={sortId} className="sr-only">Trier les projets</label>
                <select
                  id={sortId}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ProjectSort)}
                  className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
                >
                  {PROJECT_SORTS.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>

                <div role="group" aria-label="Affichage" className="flex rounded-lg border border-border bg-card p-0.5">
                  {([['grid', LayoutGrid, 'Grille'], ['list', List, 'Tableau']] as const).map(([value, Icon, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={view === value}
                      onClick={() => chooseView(value)}
                      className={cn('flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11', view === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {canManage && (
              <Link
                href="/dashboard/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nouveau projet
              </Link>
            )}
          </div>
        </div>

        {showControls && (
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            <span className="tabular-nums">
              {filtered ? `${countLabel(visible.length)} sur ${projects.length}` : countLabel(visible.length)}
            </span>
            {' · '}
            {PROJECT_SORT_HINTS[sort]}
          </p>
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyPanel
          icon={FolderKanban}
          title="Aucun projet pour l’instant"
          description={
            canManage
              ? 'Importez un dépôt GitHub : EFLEX reconnaît la stack, construit l’application et la publie avec son adresse.'
              : 'Un propriétaire ou un administrateur de l’organisation peut importer le premier dépôt.'
          }
          action={
            canManage ? (
              <LinkButton href="/dashboard/new" className="gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Importer un dépôt
              </LinkButton>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyPanel
          icon={SearchX}
          title="Aucun projet ne correspond"
          description="Essayez un autre mot-clé, ou affichez tous les statuts."
          action={
            <button
              type="button"
              onClick={() => { setQuery(''); setFilter('all') }}
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Effacer la recherche et les filtres
            </button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {visible.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      ) : (
        <ProjectsTable projects={visible} />
      )}
    </section>
  )
}
