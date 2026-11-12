import Link from 'next/link'
import { Activity, ArrowRight, CircleAlert, CircleCheck, Layers, Loader2, Rocket } from 'lucide-react'
import { StatusDot } from '@/components/dashboard/status-pill'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { relativeTime } from '@/lib/relative-time'
import { statusInfo } from '@/lib/project-status'
import type { DashboardData } from '@/lib/dashboard-data'

const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Barres empilées par jour (réussis en bas, échecs au-dessus), une seule échelle.
 * Survol/focus d'une barre : le détail du jour. Équivalent textuel pour les lecteurs d'écran.
 */
function DeploySparkbars({ series }: { series: DashboardData['series'] }) {
  const max = Math.max(1, ...series.map((d) => d.live + d.failed + d.other))
  const H = 40
  const total = series.reduce((n, d) => n + d.live + d.failed + d.other, 0)
  return (
    <figure className="mt-3">
      <div className="flex h-10 items-end gap-[3px]" aria-hidden="true">
        {series.map((d) => {
          const h = (n: number) => (n === 0 ? 0 : Math.max(3, Math.round((n / max) * H)))
          const sum = d.live + d.failed + d.other
          return (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${dayFormat.format(new Date(d.day))} : ${d.live} réussi(s), ${d.failed} en échec${d.other ? `, ${d.other} en cours` : ''}`}>
              {d.failed > 0 && <span className="w-full rounded-t-[3px] bg-destructive" style={{ height: h(d.failed) }} />}
              {d.other > 0 && <span className="w-full bg-warning/80" style={{ height: h(d.other) }} />}
              {d.live > 0 && <span className={`w-full bg-success/80 ${d.failed || d.other ? '' : 'rounded-t-[3px]'} rounded-b-[1px]`} style={{ height: h(d.live) }} />}
              {sum === 0 && <span className="h-[2px] w-full rounded-full bg-border" />}
            </div>
          )
        })}
      </div>
      <figcaption className="sr-only">
        {total} déploiements sur {series.length} jours.{' '}
        {series.filter((d) => d.live + d.failed + d.other > 0).map((d) => `${dayFormat.format(new Date(d.day))} : ${d.live} réussis, ${d.failed} en échec.`).join(' ')}
      </figcaption>
    </figure>
  )
}

/** Bandeau de chiffres utiles : chaque chiffre répond à une question qu'on se pose vraiment. */
export function OverviewStrip({ data }: { data: DashboardData }) {
  const { summary, successRate, deploymentsInWindow, series, windowDays, activity } = data
  const last = activity[0]
  return (
    <div className="space-y-2">
    <section aria-label="Aperçu" className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-border [&>*:not(:last-child)]:border-b sm:[&>*:nth-child(odd)]:border-r lg:[&>*]:border-b-0 lg:[&>*:not(:last-child)]:border-r">
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Layers className="h-3.5 w-3.5" aria-hidden="true" />Projets en ligne</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">
          {summary.live}
          <span className="text-base font-semibold text-muted-foreground"> / {summary.total}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {summary.needsAttention === 0 ? 'Rien à signaler' : `${summary.needsAttention} à regarder`}
        </p>
      </div>
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Rocket className="h-3.5 w-3.5" aria-hidden="true" />Déploiements · {windowDays} j</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{deploymentsInWindow}</p>
        <DeploySparkbars series={series} />
      </div>
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />Réussite · {windowDays} j</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{successRate === null ? '—' : `${successRate} %`}</p>
        {successRate !== null ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-destructive/20" role="img" aria-label={`${successRate} % de déploiements réussis`}>
            <div className="h-full rounded-full bg-success" style={{ width: `${successRate}%` }} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Aucun déploiement terminé sur la période.</p>
        )}
        {successRate !== null && <p className="mt-2 text-xs text-muted-foreground">Sur les déploiements terminés.</p>}
      </div>
      <div className="min-w-0 p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Activity className="h-3.5 w-3.5" aria-hidden="true" />Dernier déploiement</p>
        {last ? (
          <>
            <p className="mt-1 flex min-w-0 items-center gap-2">
              <StatusDot status={last.status} />
              <Link href={`/dashboard/projects/${last.projectId}`} className="truncate font-display text-lg font-bold hover:underline">{last.projectName}</Link>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {statusInfo(last.status).label} · <time dateTime={last.createdAt} suppressHydrationWarning>{relativeTime(last.createdAt)}</time>
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Aucun pour l&apos;instant</p>
        )}
      </div>
    </section>
    <p className="text-xs text-muted-foreground">
      Sur les {windowDays} derniers jours. Le taux de réussite ne compte que les déploiements terminés (réussis ou en échec).
    </p>
    </div>
  )
}

/** Ce qui demande un regard, en tête de page. N'apparaît pas quand tout va bien. */
export function AttentionList({ items }: { items: DashboardData['attention'] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="attention-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 id="attention-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          À regarder
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{items.length}</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Déploiements en échec ou en cours, les plus urgents d’abord. Un échec déjà corrigé par un
          déploiement réussi plus récent n’apparaît pas.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const failed = item.kind === 'failed'
          return (
            <li key={item.deploymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              {failed ? (
                <CircleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-warning motion-reduce:animate-none" aria-hidden="true" />
              )}
              <p className="min-w-0 flex-[1_1_14rem] text-sm">
                <span className="font-semibold">{item.name}</span>
                <span className="text-muted-foreground">
                  {failed ? ' : le dernier déploiement a échoué' : ` : ${statusInfo(item.status).label.toLowerCase()}`} ·{' '}
                  <time dateTime={item.at} suppressHydrationWarning>{relativeTime(item.at)}</time>
                </span>
              </p>
              <Link
                href={`/dashboard/projects/${item.projectId}?tab=deployments`}
                className="ml-7 inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline sm:ml-0 sm:min-h-0"
              >
                {failed ? 'Voir les journaux' : 'Suivre'}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only"> de {item.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Fil d'activité : les derniers déploiements de l'organisation, mis à jour en direct. */
export function ActivityFeed({ items }: { items: DashboardData['activity'] }) {
  return (
    <section aria-labelledby="activity-title" className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 id="activity-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activité récente</h2>
        <Link href="/dashboard/activity" className="text-xs font-medium text-primary hover:underline">Tout voir</Link>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Les déploiements de vos projets apparaîtront ici.</p>
      ) : (
        <ol className="px-4 py-2">
          {items.map((d, i) => (
            <li key={d.id} className="relative flex gap-3 py-2.5">
              {i < items.length - 1 && <span aria-hidden="true" className="absolute left-4 top-11 h-[calc(100%-2rem)] w-px bg-border" />}
              <FrameworkTile framework={d.framework} name={d.projectName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm">
                  <Link href={`/dashboard/projects/${d.projectId}`} className="truncate font-medium hover:underline">{d.projectName}</Link>
                  <StatusDot status={d.status} className="shrink-0" />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {statusInfo(d.status).label}
                  {d.commitSha && <> · <span className="font-mono">{d.commitSha}</span></>} · <time dateTime={d.createdAt} suppressHydrationWarning>{relativeTime(d.createdAt)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
