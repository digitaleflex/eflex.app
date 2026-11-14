import Link from 'next/link'
import { Globe, UserPlus } from 'lucide-react'
import { StatusDot } from '@/components/dashboard/status-pill'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { relativeTime } from '@/lib/relative-time'
import { statusInfo } from '@/lib/project-status'
import type { DashboardActivity } from '@/lib/dashboard-data'

type DeploymentItem = Extract<DashboardActivity, { kind: 'deployment' }>

function isDeployment(item: DashboardActivity): item is DeploymentItem {
  return item.kind === 'deployment'
}

/**
 * Liste chronologique d'événements de l'organisation (déploiements, domaines vérifiés, équipe).
 * Réutilisée sur le tableau de bord et la page Activité.
 */
export function ActivityFeed({
  items,
  emptyText = 'L’activité récente de vos projets apparaîtra ici.',
  showAllLink = true,
}: {
  items: readonly DashboardActivity[]
  emptyText?: string
  showAllLink?: boolean
}) {
  return (
    <section aria-labelledby="activity-feed-title" className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 id="activity-feed-title" className="text-sm font-semibold text-foreground">
          Activité récente
        </h2>
        {showAllLink && (
          <Link href="/dashboard/activity" className="text-xs font-medium text-primary hover:underline">
            Tout voir
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="px-4 py-2">
          {items.map((item, i) => (
            <li key={item.id} className="relative flex gap-3 py-2.5">
              {i < items.length - 1 && (
                <span aria-hidden="true" className="absolute left-4 top-11 h-[calc(100%-2rem)] w-px bg-border" />
              )}
              {isDeployment(item) ? (
                <>
                  <FrameworkTile framework={item.framework} name={item.projectName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm">
                      <Link href={`/dashboard/projects/${item.projectId}`} className="truncate font-medium hover:underline">
                        {item.projectName}
                      </Link>
                      <StatusDot status={item.status} className="shrink-0" />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {statusInfo(item.status).label}
                      {item.commitSha && (
                        <>
                          {' '}
                          · <span className="font-mono">{item.commitSha}</span>
                        </>
                      )}{' '}
                      ·{' '}
                      <time dateTime={item.createdAt} suppressHydrationWarning>
                        {relativeTime(item.createdAt)}
                      </time>
                    </p>
                  </div>
                </>
              ) : item.kind === 'domain_verified' ? (
                <>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"
                    aria-hidden="true"
                  >
                    <Globe className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm">
                      <Link href={`/dashboard/projects/${item.projectId}`} className="truncate font-medium hover:underline">
                        {item.projectName}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Domaine vérifié · <span className="font-mono">{item.hostname}</span> ·{' '}
                      <time dateTime={item.createdAt} suppressHydrationWarning>
                        {relativeTime(item.createdAt)}
                      </time>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                    aria-hidden="true"
                  >
                    <UserPlus className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm">
                      <Link href="/dashboard/organization" className="truncate font-medium hover:underline">
                        {item.memberName}
                      </Link>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      A rejoint l’équipe ·{' '}
                      <time dateTime={item.createdAt} suppressHydrationWarning>
                        {relativeTime(item.createdAt)}
                      </time>
                    </p>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
