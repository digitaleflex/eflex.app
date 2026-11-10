import { loadAdminMetricsCached } from '@/lib/admin-metrics-cache'
import {
  formatDuration,
  formatFcfa,
  formatInteger,
  formatPercent,
  parsePeriodDays,
} from '@/lib/admin-metrics'
import {
  AlertsPanel,
  DeploymentChart,
  ExportCsvLink,
  PeriodSelector,
  StackTable,
  StatCard,
} from '@/components/admin/metrics'

export const metadata = { title: 'Vue d’ensemble — Administration Eflex' }
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicateurs agrégés côté serveur et mis en cache 30 secondes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector days={days} />
          <ExportCsvLink days={days} />
        </div>
      </div>

      <AlertsPanel alerts={metrics.alerts} />

      <section aria-labelledby="admin-kpis-title">
        <h2 id="admin-kpis-title" className="sr-only">
          Indicateurs clés
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Inscriptions · 7 jours"
            value={formatInteger(metrics.users.new7)}
            hint={`+${formatInteger(metrics.users.new30)} sur 30 jours · ${formatInteger(metrics.users.total)} comptes au total · ${formatInteger(metrics.users.banned)} suspendu${metrics.users.banned > 1 ? 's' : ''}`}
          />
          <StatCard
            label="Organisations actives"
            value={formatInteger(metrics.organizations.activeInPeriod)}
            hint={`Ayant déployé sur ${days} jours, sur ${formatInteger(metrics.organizations.total)} organisations`}
          />
          <StatCard
            label="Projets"
            value={formatInteger(metrics.projects.total)}
            hint="Toutes organisations confondues"
          />
          <StatCard
            label="MRR"
            value={formatFcfa(metrics.revenue.mrrFcfa)}
            hint={`${formatInteger(metrics.revenue.activeSubscriptions)} abonnement${metrics.revenue.activeSubscriptions > 1 ? 's' : ''} actif${metrics.revenue.activeSubscriptions > 1 ? 's' : ''}`}
          />
          <StatCard
            label="Impayés"
            value={formatFcfa(unpaidTotal)}
            hint={`${formatInteger(metrics.unpaid.pendingPayments)} paiement${metrics.unpaid.pendingPayments > 1 ? 's' : ''} en attente · ${formatInteger(metrics.unpaid.pastDueSubscriptions)} abonnement${metrics.unpaid.pastDueSubscriptions > 1 ? 's' : ''} en retard`}
          />
          <StatCard
            label={`Déploiements · ${days} jours`}
            value={formatInteger(metrics.deployments.total)}
            hint={`${formatInteger(metrics.deployments.live)} réussis · ${formatInteger(metrics.deployments.failed)} en échec`}
          />
          <StatCard
            label="Taux de réussite"
            value={formatPercent(metrics.deployments.successRate)}
            hint={
              finished === 0
                ? 'Aucun déploiement terminé sur la période'
                : `${formatInteger(finished)} terminés · ${formatInteger(metrics.deployments.other)} en cours ou annulés`
            }
          />
          <StatCard
            label="Durée médiane de build"
            value={formatDuration(metrics.buildDuration.medianSeconds)}
            hint={
              metrics.buildDuration.available
                ? `Sur ${formatInteger(metrics.buildDuration.sampleCount)} déploiements`
                : 'Non mesurée : les déploiements ne conservent pas d’horodatage de fin'
            }
          />
        </div>
      </section>

      <DeploymentChart daily={metrics.deployments.daily} days={days} />

      <StackTable stacks={metrics.deployments.stacks} days={days} />

      <p className="text-xs text-muted-foreground">
        Quotas vérifiés sur {formatInteger(metrics.quotas.checkedOrganizations)} organisation
        {metrics.quotas.checkedOrganizations > 1 ? 's' : ''} ayant des projets ou des membres. Un
        déploiement est signalé comme bloqué après 30 minutes sans changement d’état.
      </p>
    </div>
  )
}
