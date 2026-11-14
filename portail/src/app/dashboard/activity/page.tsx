import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Rocket } from 'lucide-react'
import { getSession } from '@/lib/session'
import { resolveOrganization } from '@/lib/organizations'
import { prisma } from '@/lib/prisma'
import { LiveRefresh } from '@/components/live-refresh'
import { StatusPill } from '@/components/dashboard/status-pill'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { relativeTime } from '@/lib/relative-time'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { formatInteger } from '@/lib/table'
import { getPrimaryApp } from '@/lib/project-apps'
import { loadRecentOrgEvents } from '@/lib/dashboard-data'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import {
  ACTIVITY_FILTERS,
  ACTIVITY_FILTER_LABEL,
  ACTIVITY_PAGE_SIZE,
  activityEmptyState,
  activityHref,
  activityHrefTemplate,
  activityWhere,
  parseActivityFilter,
  parseActivityPage,
} from '@/lib/activity'

export const metadata = { title: 'Activité — EFLEX' }
export const dynamic = 'force-dynamic'

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const org = await resolveOrganization(session)
  if (!org) redirect('/dashboard/organization')

  const params = await searchParams
  const page = parseActivityPage(params.page)
  const filter = parseActivityFilter(params.status)
  const where = activityWhere(org.organizationId, filter)

  const total = await prisma.deployment.count({ where })
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE))
  const currentPage = Math.min(page, pages)

  const rows = await prisma.deployment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * ACTIVITY_PAGE_SIZE,
    take: ACTIVITY_PAGE_SIZE,
    select: {
      id: true,
      status: true,
      commitSha: true,
      createdAt: true,
      app: { select: { framework: true } },
      project: {
        select: {
          id: true,
          name: true,
          framework: true,
          branch: true,
          apps: {
            orderBy: [{ position: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, position: true, framework: true },
          },
        },
      },
    },
  })

  const empty = activityEmptyState(filter)
  const otherEvents = filter === 'all' ? await loadRecentOrgEvents(org.organizationId, 15) : []

  return (
    <div className="space-y-6">
      <LiveRefresh types={['deployment.created', 'deployment.status', 'member.added']} />

      <PageHeader
        title="Activité"
        description="Tous les déploiements de l’organisation, du plus récent au plus ancien. Chaque ligne indique le projet, son statut, la branche, le commit et la date."
      />

      <div className="space-y-2">
        <nav aria-label="Filtrer les déploiements" className="flex flex-wrap gap-1 border-b border-border">
          {ACTIVITY_FILTERS.map((item) => {
            const active = filter === item
            return (
              <Link
                key={item}
                href={activityHref(item)}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {ACTIVITY_FILTER_LABEL[item]}
              </Link>
            )
          })}
        </nav>
        <p className="text-xs text-muted-foreground">
          {formatInteger(total)} déploiement{total > 1 ? 's' : ''}
          {filter === 'all' ? '' : ` · filtre « ${ACTIVITY_FILTER_LABEL[filter]} »`}
          {pages > 1 ? ` · page ${formatInteger(currentPage)} sur ${formatInteger(pages)}` : ''}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Rocket}
            title={empty.title}
            description={empty.description}
            action={
              empty.resetLabel ? <LinkButton href={activityHref('all')}>{empty.resetLabel}</LinkButton> : undefined
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((deployment) => {
            const commit = deployment.commitSha === 'pending' ? null : deployment.commitSha.slice(0, 7)
            const primaryApp = getPrimaryApp(deployment.project.apps)
            const framework =
              deployment.app?.framework ?? primaryApp?.framework ?? deployment.project.framework ?? null
            return (
              <li key={deployment.id} className="p-4 transition-colors duration-200 ease-out-expo hover:bg-muted/50">
                <div className="flex min-w-0 items-start gap-3">
                  <FrameworkTile framework={framework} name={deployment.project.name} size="sm" />
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/projects/${deployment.project.id}?tab=deployments`}
                      className="block truncate text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {deployment.project.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">Projet</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Statut</dt>
                    <dd className="mt-1">
                      <StatusPill status={deployment.status} />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Branche</dt>
                    <dd className="mt-1 truncate font-mono text-foreground" title={deployment.project.branch}>
                      {deployment.project.branch}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Commit</dt>
                    <dd className="mt-1 truncate font-mono text-foreground" title={deployment.commitSha}>
                      {commit ?? <span className="font-sans text-muted-foreground">Pas encore de commit</span>}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="mt-1">
                      <time dateTime={deployment.createdAt.toISOString()} title={dateTime.format(deployment.createdAt)}>
                        {relativeTime(deployment.createdAt)}
                      </time>
                      <span className="block text-[11px] text-muted-foreground">
                        {dateTime.format(deployment.createdAt)}
                      </span>
                    </dd>
                  </div>
                </dl>
              </li>
            )
          })}
        </ul>
      )}

      <Pagination
        page={currentPage}
        pages={pages}
        hrefTemplate={activityHrefTemplate(filter)}
        label="Pagination de l’activité"
      />

      {filter === 'all' && otherEvents.length > 0 ? (
        <section aria-label="Autres événements récents" className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Équipe et domaines</h2>
            <p className="text-xs text-muted-foreground">
              Derniers domaines vérifiés et membres ajoutés à l’organisation.
            </p>
          </div>
          <ActivityFeed
            items={otherEvents}
            emptyText="Aucun événement d’équipe ou de domaine pour le moment."
            showAllLink={false}
          />
        </section>
      ) : null}
    </div>
  )
}
