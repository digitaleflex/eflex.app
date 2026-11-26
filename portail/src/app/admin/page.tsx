import { Suspense } from 'react'
import {
  Building2,
  CircleAlert,
  FolderGit2,
  Rocket,
  Target,
  Timer,
  UserPlus,
  Wallet,
} from 'lucide-react'
import { loadAdminMetricsCached } from '@/lib/admin-metrics-cache'
import {
  formatDayLong,
  formatDuration,
  formatFcfa,
  formatInteger,
  formatPercent,
  parsePeriodDays,
} from '@/lib/admin-metrics'
import { PageHeader } from '@/components/page-header'
import { PlatformStatus } from '@/components/admin/platform-status'
import { StatCard } from '@/components/ui/stat-card'
import {
  AlertsPanel,
  DeploymentChart,
  ExportCsvLink,
  PeriodSelector,
  RecurringErrorsPanel,
  StackTable,
} from '@/components/admin/metrics'

export const metadata = { title: 'Vue d’ensemble — Administration' }
export const dynamic = 'force-dynamic'

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>
}) {
  const params = await searchParams
  const days = parsePeriodDays(params.days)
  const metrics = await loadAdminMetricsCached(days)

  const finished = metrics.deployments.live + metrics.deployments.failed
  const unpaidTotal = metrics.unpaid.pendingAmountFcfa + metrics.unpaid.pastDueAmountFcfa
  const firstDay = metrics.deployments.daily[0]?.day
  const lastDay = metrics.deployments.daily[metrics.deployments.daily.length - 1]?.day
  const periodRange =
    firstDay && lastDay
      ? `du ${formatDayLong(firstDay)} au ${formatDayLong(lastDay)} (UTC)`
      : `sur les ${formatInteger(days)} derniers jours (UTC)`

  return (
    <div className="space-y-10">
      <PageHeader
        title="Vue d’ensemble"
        description={`Indicateurs agrégés côté serveur, mis en cache 30 secondes. Période sélectionnée : ${formatInteger(days)} derniers jours, ${periodRange}.`}
        actions={
          <>
            <PeriodSelector days={days} />
            <ExportCsvLink days={days} />
          </>
        }
      />

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground" role="status">
            Collecte de l’état de la plateforme…
          </p>
        }
      >
        <PlatformStatus />
      </Suspense>

      <section aria-labelledby="admin-action-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="admin-action-title" className="text-lg font-semibold">
            À traiter en priorité
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Alertes et signaux qui peuvent nécessiter une intervention. Les détails ci-dessous indiquent la gravité,
            la cause probable et les liens utiles.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <AlertsPanel alerts={metrics.alerts} />
          <RecurringErrorsPanel errors={metrics.recurringErrors} days={days} />
        </div>
      </section>

      <section aria-labelledby="admin-followup-title" className="space-y-6">
        <div className="space-y-1">
          <h2 id="admin-followup-title" className="text-lg font-semibold">
            Indicateurs de suivi
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Vue factuelle de l’activité, des déploiements et des revenus. Chaque carte précise sa période et son
            dénominateur. Un tiret « — » signifie « non mesuré », jamais zéro.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Activité</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label={`Inscriptions · ${formatInteger(days)} jours`}
                value={formatInteger(metrics.users.newInPeriod)}
                hint={`7 derniers jours : ${formatInteger(metrics.users.new7)} · 30 derniers jours : ${formatInteger(metrics.users.new30)} · ${formatInteger(metrics.users.total)} comptes au total`}
                icon={UserPlus}
                href="/admin/users"
              />
              <StatCard
                label="Organisations actives"
                value={formatInteger(metrics.organizations.activeInPeriod)}
                hint={`Ayant déployé au moins une fois sur ${formatInteger(days)} jours · ${formatInteger(metrics.organizations.total)} organisations au total`}
                icon={Building2}
                tone="info"
                href="/admin/organizations"
              />
              <StatCard
                label="Projets"
                value={formatInteger(metrics.projects.total)}
                hint="Toutes organisations confondues, à l’instant (hors période)"
                icon={FolderGit2}
                href="/admin/projects"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Déploiements et qualité
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label={`Déploiements · ${formatInteger(days)} jours`}
                value={formatInteger(metrics.deployments.total)}
                hint={`${formatInteger(metrics.deployments.live)} réussis · ${formatInteger(metrics.deployments.failed)} en échec · ${formatInteger(metrics.deployments.other)} sans issue (en cours ou annulés)`}
                icon={Rocket}
                href="/admin/deployments"
              />
              <StatCard
                label="Taux de réussite"
                value={formatPercent(metrics.deployments.successRate)}
                hint={
                  finished === 0
                    ? 'Dénominateur nul : aucun déploiement terminé sur la période'
                    : `${formatInteger(metrics.deployments.live)} réussis ÷ ${formatInteger(finished)} terminés · ${formatInteger(metrics.deployments.other)} sans issue exclus`
                }
                icon={Target}
                tone={metrics.deployments.successRate === null ? 'neutral' : 'positive'}
                href="/admin/deployments"
              />
              <StatCard
                label="Durée médiane de build"
                value={formatDuration(metrics.buildDuration.medianSeconds)}
                hint={
                  metrics.buildDuration.available
                    ? `Médiane sur ${formatInteger(metrics.buildDuration.sampleCount)} déploiements terminés`
                    : 'Non mesurée : les déploiements ne conservent pas d’horodatage de fin'
                }
                icon={Timer}
                tone="neutral"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Revenus</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="MRR"
                value={formatFcfa(metrics.revenue.mrrFcfa)}
                hint={`${formatInteger(metrics.revenue.activeSubscriptions)} abonnement${metrics.revenue.activeSubscriptions > 1 ? 's' : ''} actif${metrics.revenue.activeSubscriptions > 1 ? 's' : ''} × prix mensuel · revenu récurrent, hors paiements ponctuels`}
                icon={Wallet}
                tone="positive"
                href="/admin/organizations"
              />
              <StatCard
                label="Impayés"
                value={formatFcfa(unpaidTotal)}
                hint={`${formatInteger(metrics.unpaid.pendingPayments)} paiement${metrics.unpaid.pendingPayments > 1 ? 's' : ''} en attente (${formatFcfa(metrics.unpaid.pendingAmountFcfa)}) · ${formatInteger(metrics.unpaid.pastDueSubscriptions)} abonnement${metrics.unpaid.pastDueSubscriptions > 1 ? 's' : ''} en retard (${formatFcfa(metrics.unpaid.pastDueAmountFcfa)})`}
                icon={CircleAlert}
                tone={unpaidTotal > 0 ? 'warning' : 'neutral'}
                href="/admin/payments"
              />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="admin-trends-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="admin-trends-title" className="text-lg font-semibold">
            Tendances et répartition
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Évolution quotidienne des déploiements et comparaison des stacks sur la période sélectionnée.
          </p>
        </div>
        <div className="space-y-6">
          <DeploymentChart daily={metrics.deployments.daily} days={days} />
          <StackTable stacks={metrics.deployments.stacks} days={days} />
        </div>
      </section>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Comment ces indicateurs sont calculés
        </summary>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Inscriptions</dt>
            <dd className="text-muted-foreground">
              Comptes créés dans la fenêtre sélectionnée. Les rappels à 7 et 30 jours ont leur propre fenêtre,
              indépendante du sélecteur.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Organisations actives</dt>
            <dd className="text-muted-foreground">
              Organisations ayant créé au moins un déploiement dans la période, divisées par le nombre total
              d’organisations.
            </dd>
          </div>
          <div>
            <dt className="font-medium">MRR et impayés</dt>
            <dd className="text-muted-foreground">
              MRR = somme des prix mensuels des abonnements réellement actifs. Les impayés additionnent les paiements
              en attente et les abonnements en retard, à l’instant.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Taux de réussite</dt>
            <dd className="text-muted-foreground">
              Réussis ÷ (réussis + échecs) parmi les déploiements créés dans la période. Les déploiements en cours ou
              annulés sont exclus du dénominateur ; sans déploiement terminé, le taux vaut « — ».
            </dd>
          </div>
          <div>
            <dt className="font-medium">Durée médiane de build</dt>
            <dd className="text-muted-foreground">
              Calculée sur les durées réellement mesurées. La base ne stocke pas d’horodatage de fin : tant qu’il
              manque, l’indicateur reste « — » au lieu d’être inventé.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Quotas</dt>
            <dd className="text-muted-foreground">
              Vérifiés sur {formatInteger(metrics.quotas.checkedOrganizations)} organisation
              {metrics.quotas.checkedOrganizations > 1 ? 's' : ''} ayant des projets ou des membres. Un déploiement
              est signalé comme bloqué après 30 minutes sans changement d’état.
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}
