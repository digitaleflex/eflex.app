import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { resolveOrganization } from '@/lib/organizations'
import { prisma } from '@/lib/prisma'
import { LiveRefresh } from '@/components/live-refresh'
import { StatusPill } from '@/components/dashboard/status-pill'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { relativeTime } from '@/lib/relative-time'

export const metadata = { title: 'Activité — Eflex' }
export const dynamic = 'force-dynamic'

const PAGE = 30
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const org = await resolveOrganization(session)
  if (!org) redirect('/dashboard/organization')

  const { page: pageParam, status } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
  const statusFilter = status === 'failed' || status === 'live' ? status : undefined
  const where = { project: { organizationId: org.organizationId }, ...(statusFilter ? { status: statusFilter } : {}) }
  const [total, rows] = await Promise.all([
    prisma.deployment.count({ where }),
    prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, status: true, commitSha: true, createdAt: true, project: { select: { id: true, name: true, framework: true, branch: true } } },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const href = (p: number, s = statusFilter) => `/dashboard/activity?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`
  const tabs = [
    { id: undefined, label: 'Tous' },
    { id: 'live', label: 'Réussis' },
    { id: 'failed', label: 'En échec' },
  ] as const

  return (
    <div className="space-y-6">
      <LiveRefresh types={['deployment.created', 'deployment.status']} />
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Activité</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tous les déploiements de l&apos;organisation, du plus récent au plus ancien.</p>
      </header>

      <nav aria-label="Filtrer les déploiements" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={href(1, t.id)}
            aria-current={statusFilter === t.id ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${statusFilter === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-medium">Aucun déploiement {statusFilter === 'failed' ? 'en échec' : statusFilter === 'live' ? 'réussi' : ''}</p>
          <p className="mt-1 text-sm text-muted-foreground">Chaque mise en ligne de vos projets apparaîtra ici, avec son statut et ses journaux.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((d) => (
            <li key={d.id} className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[auto_minmax(0,1fr)_10rem_auto]">
              <FrameworkTile framework={d.project.framework} name={d.project.name} size="sm" />
              <div className="min-w-0">
                <Link href={`/dashboard/projects/${d.project.id}?tab=deployments`} className="block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none">
                  {d.project.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{d.project.branch}</span>
                  {d.commitSha !== 'pending' && <> · <span className="font-mono">{d.commitSha.slice(0, 7)}</span></>}
                </p>
              </div>
              <time dateTime={d.createdAt.toISOString()} title={dateTime.format(d.createdAt)} className="hidden text-xs text-muted-foreground sm:block">
                {relativeTime(d.createdAt)}
              </time>
              <StatusPill status={d.status} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center text-primary hover:underline">← Plus récents</Link> : <span />}
          <span className="text-muted-foreground">Page {page} sur {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center text-primary hover:underline">Plus anciens →</Link> : <span />}
        </nav>
      )}
    </div>
  )
}
