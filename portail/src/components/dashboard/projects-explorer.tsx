'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import { FolderKanban, LayoutGrid, List, Plus, Search, SearchX } from 'lucide-react'
import { ProjectCard } from '@/components/dashboard/project-card'
import { ProjectsTable } from '@/components/dashboard/projects-table'
import { EmptyPanel } from '@/components/dashboard/section'
import {
  PROJECT_FILTERS,
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
  const sort: ProjectSort = initialSort
  const [view, setView] = useState<View>('list')
  const searchId = useId()
  const filterId = useId()

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

  const counts = useMemo(() => projectFilterCounts(projects), [projects])
  const visible = useMemo(
    () => selectProjects(projects, { query, filter, sort }),
    [projects, query, filter, sort],
  )
  const filtered = query.trim() !== '' || filter !== 'all'

  return (
    <section aria-labelledby="projects-title" className="space-y-3">
      <h2 id="projects-title" className="sr-only">Projets</h2>

      {/* Barre d'outils réduite à l'essentiel (Vercel) : une recherche, un filtre de statut, l'affichage.
          Le tri reste automatique : ce qui demande une action d'abord, sinon l'activité récente. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">Rechercher un projet</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un projet…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={filterId} className="sr-only">Filtrer par statut</label>
          <select
            id={filterId}
            value={filter}
            onChange={(e) => setFilter(e.target.value as ProjectFilter)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
          >
            {PROJECT_FILTERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id === 'all' ? 'Tous les statuts' : item.label} ({counts[item.id]})
              </option>
            ))}
          </select>
          <div role="group" aria-label="Affichage" className="flex rounded-lg border border-input p-0.5">
            {([['grid', LayoutGrid, 'Grille'], ['list', List, 'Liste']] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => chooseView(value)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10',
                  view === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Annonce le résultat de la recherche aux lecteurs d'écran, sans ligne visible en plus. */}
        <p role="status" aria-live="polite" className="sr-only">
          {filtered ? `${countLabel(visible.length)} sur ${projects.length}` : countLabel(visible.length)}
        </p>
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
              <Link
                href="/dashboard/new"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Importer un dépôt
              </Link>
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
