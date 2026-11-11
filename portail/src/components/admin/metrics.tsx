import Link from 'next/link'
import { CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { frameworkLabel } from '@/lib/frameworks'
import { cn } from '@/lib/utils'
import {
  PERIOD_OPTIONS,
  formatDayLong,
  formatDayShort,
  formatInteger,
  formatPercent,
  type AdminAlert,
  type AdminMetrics,
  type PeriodDays,
} from '@/lib/admin-metrics'

/** Sélecteur de période : de vrais liens, utilisables au clavier et sans JavaScript. */
export function PeriodSelector({ days }: { days: PeriodDays }) {
  return (
    <nav aria-label="Période des indicateurs" className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1">
      {PERIOD_OPTIONS.map((option) => {
        const active = option === days
        return (
          <Link
            key={option}
            href={`/admin?days=${option}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {formatInteger(option)} jours
          </Link>
        )
      })}
    </nav>
  )
}

export function ExportCsvLink({ days }: { days: PeriodDays }) {
  return (
    <a
      href={`/api/admin/metrics/export?days=${days}`}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Exporter en CSV<span className="sr-only"> pour la période de {days} jours</span>
    </a>
  )
}

/** Alertes : le libellé de gravité est écrit, la couleur ne porte jamais l'information seule. */
export function AlertsPanel({ alerts }: { alerts: AdminMetrics['alerts'] }) {
  return (
    <section aria-labelledby="admin-alerts-title" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 id="admin-alerts-title" className="font-semibold">
          Alertes
        </h2>
      </div>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          Aucune alerte sur la période.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AlertRow({ alert }: { alert: AdminAlert }) {
  const critical = alert.severity === 'critical'
  const warning = alert.severity === 'warning'
  return (
    <li className="flex gap-3 px-5 py-4">
      {critical || warning ? (
        <CircleAlert
          className={cn('mt-0.5 h-5 w-5 shrink-0', critical ? 'text-destructive' : 'text-warning')}
          aria-hidden="true"
        />
      ) : (
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {alert.title}
          <Badge variant={critical ? 'destructive' : warning ? 'warning' : 'outline'}>
            {critical ? 'Critique' : warning ? 'Attention' : 'Information'}
          </Badge>
        </p>
        <p className="text-sm text-muted-foreground">{alert.detail}</p>
      </div>
    </li>
  )
}

const failedPattern = {
  backgroundImage:
    'repeating-linear-gradient(45deg, transparent 0 2px, hsl(var(--destructive-foreground) / 0.45) 2px 3px)',
}

/** Barres empilées par jour + tableau complet : aucune information portée par la couleur seule. */
export function DeploymentChart({
  daily,
  days,
}: {
  daily: AdminMetrics['deployments']['daily']
  days: PeriodDays
}) {
  const max = Math.max(1, ...daily.map((bucket) => bucket.live + bucket.failed + bucket.other))
  const totals = daily.reduce(
    (acc, bucket) => {
      acc.live += bucket.live
      acc.failed += bucket.failed
      acc.other += bucket.other
      return acc
    },
    { live: 0, failed: 0, other: 0 },
  )
  const total = totals.live + totals.failed + totals.other
  const first = daily[0]?.day
  const last = daily[daily.length - 1]?.day
  const middle = daily[Math.floor(daily.length / 2)]?.day
  const height = (value: number) => `max(2px, ${(value / max) * 100}%)`

  return (
    <section aria-labelledby="admin-deployments-title" className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-deployments-title" className="font-semibold">
          Déploiements par jour
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatInteger(total)} sur {days} jours
        </p>
      </div>

      <figure className="mt-4">
        <div className="flex h-36 items-end gap-[2px]" aria-hidden="true">
          {daily.map((bucket) => {
            const dayTotal = bucket.live + bucket.failed + bucket.other
            return (
              <div
                key={bucket.day}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${formatDayLong(bucket.day)} : ${bucket.live} réussi(s), ${bucket.failed} en échec, ${bucket.other} autre(s)`}
              >
                {bucket.other > 0 && (
                  <span className="w-full bg-warning/80" style={{ height: height(bucket.other) }} />
                )}
                {bucket.failed > 0 && (
                  <span
                    className="w-full bg-destructive"
                    style={{ ...failedPattern, height: height(bucket.failed) }}
                  />
                )}
                {bucket.live > 0 && (
                  <span className="w-full bg-success" style={{ height: height(bucket.live) }} />
                )}
                {dayTotal === 0 && <span className="h-[2px] w-full rounded-full bg-border" />}
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" aria-hidden="true">
          <span>{first ? formatDayShort(first) : ''}</span>
          {middle && daily.length > 2 && <span>{formatDayShort(middle)}</span>}
          <span>{last ? formatDayShort(last) : ''}</span>
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-success" />
            Réussis
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-destructive" style={failedPattern} />
            Échecs (hachures)
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-warning/80" />
            Autres (en cours ou annulés)
          </li>
        </ul>

        <figcaption className="mt-3 text-sm text-muted-foreground">
          {total === 0
            ? `Aucun déploiement ${first && last ? `du ${formatDayLong(first)} au ${formatDayLong(last)}` : 'sur la période'}.`
            : `${formatInteger(totals.live)} réussis, ${formatInteger(totals.failed)} en échec et ${formatInteger(totals.other)} en cours ou annulés${first && last ? `, du ${formatDayLong(first)} au ${formatDayLong(last)}` : ''}.`}
        </figcaption>

        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Voir les données jour par jour
          </summary>
          <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Déploiements par jour sur les {days} derniers jours
              </caption>
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Jour</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Réussis</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Échecs</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Autres</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {daily.map((bucket) => (
                  <tr key={bucket.day}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <time dateTime={bucket.day}>{formatDayLong(bucket.day)}</time>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInteger(bucket.live)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInteger(bucket.failed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInteger(bucket.other)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatInteger(bucket.live + bucket.failed + bucket.other)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </section>
  )
}

/** Réussite par stack : le tableau est lui-même l'alternative textuelle du graphique. */
export function StackTable({ stacks, days }: { stacks: AdminMetrics['deployments']['stacks']; days: PeriodDays }) {
  return (
    <section aria-labelledby="admin-stacks-title" className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-stacks-title" className="font-semibold">
          Taux de réussite par stack
        </h2>
        <p className="text-xs text-muted-foreground">Sur {days} jours</p>
      </div>

      {stacks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Aucun déploiement sur la période.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Déploiements et taux de réussite par stack sur les {days} derniers jours
            </caption>
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-2 font-medium">Stack</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Réussis</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Échecs</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Autres</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Taux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stacks.map((stack) => (
                <tr key={stack.framework}>
                  <th scope="row" className="px-2 py-2.5 text-left font-medium">
                    {frameworkLabel(stack.framework)}
                  </th>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatInteger(stack.live)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatInteger(stack.failed)}</td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
                    {formatInteger(stack.other)}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <span aria-hidden="true" className="hidden h-2 w-20 overflow-hidden rounded-full bg-destructive/20 sm:block">
                        <span
                          className="block h-full rounded-full bg-success"
                          style={{ width: `${stack.successRate ?? 0}%` }}
                        />
                      </span>
                      <span className="min-w-[3.5rem] text-right tabular-nums">{formatPercent(stack.successRate)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
