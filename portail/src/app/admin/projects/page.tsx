import Link from 'next/link'
import { ArrowUpRight, ListOrdered, RefreshCw, Search } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { frameworkLabel } from '@/lib/frameworks'
import { relativeTime } from '@/lib/relative-time'
import { repoLabel } from '@/lib/repo'
import { deploymentTimeoutMs } from '@/lib/deployment-watchdog'
import {
  ADMIN_PAGE_SIZE,
  PROJECT_FILTERS,
  PROJECT_LIST_LIMIT,
  deploymentDuration,
  matchesProjectFilter,
  parseProjectListQuery,
  projectListWhere,
  type ProjectListFilter,
} from '@/lib/admin-projects'

export const metadata = { title: 'Projets — Administration Eflex' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const numberFormat = new Intl.NumberFormat('fr-FR')

const FILTER_LABELS: Record<ProjectListFilter, string> = {
  all: 'Tous',
  failed: 'Dernier déploiement en échec',
  active: 'Déploiement en cours',
  stuck: 'Bloqués',
  never: 'Sans déploiement',
}

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string; stack?: string; q?: string; page?: string }>
}) {
  await requireAdminPage()
  const query = parseProjectListQuery(await searchParams)
  const now = new Date()
  const timeoutMs = deploymentTimeoutMs()
  const stuckMinutes = Math.max(1, Math.round(timeoutMs / 60_000))

  const loaded = await prisma.project.findMany({
    where: projectListWhere(query),
    orderBy: { createdAt: 'desc' },
    take: PROJECT_LIST_LIMIT + 1,
    select: {
      id: true,
      name: true,
      slug: true,
      repoUrl: true,
      framework: true,
      domain: true,
      createdAt: true,
      organization: { select: { id: true, name: true } },
      deployments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true, createdAt: true },
      },
    },
  })

  const truncated = loaded.length > PROJECT_LIST_LIMIT
  const filtered = loaded
    .slice(0, PROJECT_LIST_LIMIT)
    .filter((project) => matchesProjectFilter(project.deployments[0] ?? null, query.filter, now, timeoutMs))
  const pages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE))
  const page = Math.min(query.page, pages)
  const rows = filtered.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE)

  const href = (filter: ProjectListFilter, targetPage = 1) => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('etat', filter)
    if (query.stack) params.set('stack', query.stack)
    if (query.query) params.set('q', query.query)
    if (targetPage > 1) params.set('page', String(targetPage))
    const search = params.toString()
    return `/admin/projects${search ? `?${search}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Toutes les organisations. {numberFormat.format(filtered.length)} projet{filtered.length > 1 ? 's' : ''}
            {query.stack ? ` en ${frameworkLabel(query.stack)}` : ''} correspondant aux filtres.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/deployments"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ListOrdered className="h-4 w-4" aria-hidden="true" />
            File des déploiements
          </Link>
          <Link
            href="/admin/projects/reconciliation"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Réconciliation
          </Link>
        </div>
      </div>

      <nav aria-label="Filtrer les projets" className="flex flex-wrap gap-2">
        {PROJECT_FILTERS.map((filter) => {
          const label = filter === 'stuck' ? `${FILTER_LABELS[filter]} (> ${stuckMinutes} min)` : FILTER_LABELS[filter]
          const active = query.filter === filter
          return (
            <Link
              key={filter}
              href={href(filter)}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'inline-flex min-h-11 items-center rounded-full border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary'
                  : 'inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
              }
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <form role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="etat" value={query.filter === 'all' ? '' : query.filter} />
        <div className="sm:flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-medium">
            Rechercher un projet
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.query}
            placeholder="Nom, slug, dépôt ou domaine"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="stack" className="mb-1 block text-sm font-medium">
            Stack
          </label>
          <select
            id="stack"
            name="stack"
            defaultValue={query.stack ?? ''}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-52"
          >
            <option value="">Toutes les stacks</option>
            {['nextjs', 'nuxt', 'astro', 'vite', 'svelte', 'remix', 'solidstart', 'redwoodjs', 'node', 'laravel', 'php', 'python', 'static', 'docker', 'eflex-config'].map((stack) => (
              <option key={stack} value={stack}>
                {frameworkLabel(stack)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Filtrer
        </button>
      </form>

      {truncated && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          Seuls les {numberFormat.format(PROJECT_LIST_LIMIT)} projets les plus récents sont parcourus pour ce filtre.
          Affinez la recherche (nom, stack) pour voir les autres.
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">Aucun projet pour ce filtre</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Modifiez la recherche ou revenez à la liste complète.
            </p>
            <Link href="/admin/projects" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
              Voir tous les projets
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border sm:hidden" aria-label="Liste des projets">
              {rows.map((project) => {
                const last = project.deployments[0] ?? null
                return (
                  <li key={project.id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                          {project.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{project.organization.name}</p>
                      </div>
                      <StatusPill status={last?.status} />
                    </div>
                    <p className="break-all text-xs text-muted-foreground">{repoLabel(project.repoUrl)}</p>
                    <p className="text-xs text-muted-foreground">
                      {frameworkLabel(project.framework)}
                      {project.domain ? ` · ${project.domain}` : ' · aucun domaine'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {last ? (
                        <>
                          Dernier déploiement {relativeTime(last.createdAt)} · {deploymentDuration(last, now).label}
                        </>
                      ) : (
                        'Aucun déploiement'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Créé le {dateFormat.format(project.createdAt)}</p>
                  </li>
                )
              })}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Projets de toutes les organisations, du plus récent au plus ancien</caption>
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Projet</th>
                    <th scope="col" className="px-4 py-3 font-medium">Dépôt</th>
                    <th scope="col" className="px-4 py-3 font-medium">Stack</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Domaine</th>
                    <th scope="col" className="px-4 py-3 font-medium">Dernier déploiement</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Créé le</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Fiche</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((project) => {
                    const last = project.deployments[0] ?? null
                    return (
                      <tr key={project.id}>
                        <td className="px-4 py-3">
                          <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                            {project.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {project.organization.name} · <span className="font-mono">{project.slug}</span>
                          </p>
                        </td>
                        <td className="max-w-48 px-4 py-3">
                          <span className="block truncate text-xs text-muted-foreground">{repoLabel(project.repoUrl)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs">{frameworkLabel(project.framework)}</td>
                        <td className="hidden max-w-48 px-4 py-3 text-xs lg:table-cell">
                          <span className="block truncate">{project.domain ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={last?.status} />
                          {last && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <time dateTime={last.createdAt.toISOString()}>{relativeTime(last.createdAt)}</time>
                            </p>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                          {dateFormat.format(project.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/projects/${project.id}`}
                            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline sm:min-h-0"
                          >
                            Fiche
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only"> de {project.name}</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(query.filter, page - 1)} className="inline-flex min-h-11 items-center text-primary hover:underline">
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link href={href(query.filter, page + 1)} className="inline-flex min-h-11 items-center text-primary hover:underline">
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}
