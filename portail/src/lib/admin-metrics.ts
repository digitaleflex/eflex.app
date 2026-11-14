import { isActiveSubscription, planById } from '@/lib/plans'

/**
 * Indicateurs du tableau de bord d'administration.
 *
 * Module volontairement pur (aucun accès Prisma, aucun accès réseau) : les
 * agrégats sont calculés en base puis mis en forme ici, ce qui rend les règles
 * testables sans base de données. Les libellés sont en français.
 */

export const PERIOD_OPTIONS = [7, 30, 90] as const
export type PeriodDays = (typeof PERIOD_OPTIONS)[number]
export const DEFAULT_PERIOD: PeriodDays = 30

const MS_DAY = 86_400_000

/** Lit `?days=` en se limitant aux périodes proposées (7, 30 ou 90 jours). */
export function parsePeriodDays(value: string | string[] | null | undefined): PeriodDays {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  return (PERIOD_OPTIONS as readonly number[]).includes(parsed) ? (parsed as PeriodDays) : DEFAULT_PERIOD
}

/** Minuit UTC du jour de `date` : les fenêtres ne dépendent pas du fuseau du serveur. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/** Début de la fenêtre, jour courant inclus (`days` jours calendaires en UTC). */
export function periodStart(days: number, now = new Date()): Date {
  const span = Math.max(1, Math.trunc(days))
  return new Date(startOfUtcDay(now).getTime() - (span - 1) * MS_DAY)
}

export function dayKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export type DailyDeploymentBucket = { day: string; live: number; failed: number; other: number }

/**
 * Complète les agrégats SQL (`jour × statut → nombre`) en une série continue,
 * du plus ancien au plus récent, jours sans déploiement inclus.
 */
export function dailyDeploymentSeries(
  rows: readonly { day: string; status: string; count: number }[],
  days: number,
  now = new Date(),
): DailyDeploymentBucket[] {
  const span = Math.max(1, Math.trunc(days))
  const start = periodStart(span, now)
  const buckets = new Map<string, DailyDeploymentBucket>()
  for (let i = 0; i < span; i += 1) {
    const day = dayKeyUtc(new Date(start.getTime() + i * MS_DAY))
    buckets.set(day, { day, live: 0, failed: 0, other: 0 })
  }
  for (const row of rows) {
    const bucket = buckets.get(row.day)
    if (!bucket || !Number.isFinite(row.count)) continue
    const count = Math.max(0, Math.trunc(row.count))
    if (row.status === 'live') bucket.live += count
    else if (row.status === 'failed') bucket.failed += count
    else bucket.other += count
  }
  return [...buckets.values()]
}

export type DeploymentTotals = { live: number; failed: number; other: number; total: number }

export function deploymentTotals(daily: readonly DailyDeploymentBucket[]): DeploymentTotals {
  const totals = daily.reduce(
    (acc, bucket) => {
      acc.live += bucket.live
      acc.failed += bucket.failed
      acc.other += bucket.other
      return acc
    },
    { live: 0, failed: 0, other: 0 },
  )
  return { ...totals, total: totals.live + totals.failed + totals.other }
}

/** Taux de réussite parmi les déploiements qui ont une issue ; null s'il n'y en a aucun. */
export function successRate(live: number, failed: number): number | null {
  const finished = Math.max(0, live) + Math.max(0, failed)
  if (finished === 0) return null
  return Math.round((Math.max(0, live) / finished) * 100)
}

export type StackDeploymentStat = {
  framework: string
  live: number
  failed: number
  other: number
  total: number
  successRate: number | null
}

/** Taux de réussite par stack sur la période, du plus actif au moins actif. */
export function stackDeploymentStats(
  rows: readonly { framework: string; status: string; count: number }[],
): StackDeploymentStat[] {
  const byFramework = new Map<string, Omit<StackDeploymentStat, 'total' | 'successRate'>>()
  for (const row of rows) {
    const framework = row.framework?.trim() || 'inconnu'
    const entry = byFramework.get(framework) ?? { framework, live: 0, failed: 0, other: 0 }
    const count = Number.isFinite(row.count) ? Math.max(0, Math.trunc(row.count)) : 0
    if (row.status === 'live') entry.live += count
    else if (row.status === 'failed') entry.failed += count
    else entry.other += count
    byFramework.set(framework, entry)
  }
  return [...byFramework.values()]
    .map((entry) => ({
      ...entry,
      total: entry.live + entry.failed + entry.other,
      successRate: successRate(entry.live, entry.failed),
    }))
    .sort((a, b) => b.total - a.total || a.framework.localeCompare(b.framework, 'fr'))
}

/**
 * Durée médiane d'un échantillon de durées (en millisecondes), arrondie en
 * secondes. Les valeurs négatives ou non finies sont ignorées.
 */
export function medianDurationSeconds(samplesMs: readonly number[]): number | null {
  const values = samplesMs.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  if (values.length === 0) return null
  const middle = Math.floor(values.length / 2)
  const median =
    values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2
  return Math.round(median / 1000)
}

export type RevenueSummary = { mrrFcfa: number; activeSubscriptions: number }

/** MRR à partir de l'agrégat des abonnements réellement actifs. */
export function revenueSummary(activeSubscriptions: number, monthlyAmountFcfa: number | null): RevenueSummary {
  const count = Number.isFinite(activeSubscriptions) ? Math.max(0, Math.trunc(activeSubscriptions)) : 0
  const amount =
    monthlyAmountFcfa !== null && Number.isFinite(monthlyAmountFcfa)
      ? Math.max(0, Math.trunc(monthlyAmountFcfa))
      : 0
  return { mrrFcfa: amount, activeSubscriptions: count }
}

export type UnpaidSummary = {
  pendingPayments: number
  pendingAmountFcfa: number
  pastDueSubscriptions: number
  pastDueAmountFcfa: number
}

/** Impayés à partir des agrégats (`Payment.pending` et `Subscription.past_due`). */
export function unpaidSummary(input: {
  pendingPayments: number
  pendingAmountFcfa: number | null
  pastDueSubscriptions: number
  pastDueAmountFcfa: number | null
}): UnpaidSummary {
  const count = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)
  const amount = (value: number | null) =>
    value !== null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  return {
    pendingPayments: count(input.pendingPayments),
    pendingAmountFcfa: amount(input.pendingAmountFcfa),
    pastDueSubscriptions: count(input.pastDueSubscriptions),
    pastDueAmountFcfa: amount(input.pastDueAmountFcfa),
  }
}

export type QuotaOverrun = {
  organizationId: string
  name: string
  kind: 'projects' | 'members'
  used: number
  limit: number
  plan: string
}

type OrganizationWithSubscription = {
  id: string
  name: string
  subscription: { plan: string; status: string } | null
}

/**
 * Organisations au-delà de leur quota effectif (projets ou membres). Le plan
 * gratuit s'applique quand l'abonnement est absent ou inactif, exactement comme
 * dans `lib/billing.ts`.
 */
export function quotaOverruns(
  organizations: readonly OrganizationWithSubscription[],
  projectCounts: readonly { organizationId: string; count: number }[],
  memberCounts: readonly { organizationId: string; count: number }[],
): QuotaOverrun[] {
  const toMap = (rows: readonly { organizationId: string; count: number }[]) =>
    new Map(rows.map((row) => [row.organizationId, Math.max(0, Math.trunc(row.count))]))
  const projects = toMap(projectCounts)
  const members = toMap(memberCounts)

  const overruns: QuotaOverrun[] = []
  for (const organization of organizations) {
    const subscription = organization.subscription
    const plan =
      subscription && isActiveSubscription(subscription.status) ? planById(subscription.plan) : planById('free')
    const checks = [
      { kind: 'projects' as const, used: projects.get(organization.id) ?? 0, limit: plan.projectLimit },
      { kind: 'members' as const, used: members.get(organization.id) ?? 0, limit: plan.memberLimit },
    ]
    for (const check of checks) {
      if (check.used > check.limit) {
        overruns.push({
          organizationId: organization.id,
          name: organization.name,
          kind: check.kind,
          used: check.used,
          limit: check.limit,
          plan: plan.label,
        })
      }
    }
  }

  return overruns.sort(
    (a, b) =>
      b.used / Math.max(1, b.limit) - a.used / Math.max(1, a.limit) ||
      a.name.localeCompare(b.name, 'fr'),
  )
}

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AdminAlert = { id: string; severity: AlertSeverity; title: string; detail: string }

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** Alertes simples, déterministes et triées : le critique d'abord. */
export function buildAdminAlerts(input: {
  failedDeployments: number
  finishedDeployments: number
  stuckDeployments: number
  pendingPayments: number
  pendingAmountFcfa: number
  pastDueSubscriptions: number
  quotaOverruns: readonly QuotaOverrun[]
}): AdminAlert[] {
  const alerts: AdminAlert[] = []

  if (input.stuckDeployments > 0) {
    alerts.push({
      id: 'stuck-deployments',
      severity: 'critical',
      title: `${formatInteger(input.stuckDeployments)} déploiement${input.stuckDeployments > 1 ? 's' : ''} bloqué${input.stuckDeployments > 1 ? 's' : ''} depuis plus de 30 minutes`,
      detail:
        'La file de déploiements ne progresse plus. Vérifiez le worker BullMQ et les journaux de déploiement.',
    })
  }

  if (input.failedDeployments > 0) {
    const rate = successRate(input.finishedDeployments - input.failedDeployments, input.failedDeployments)
    const failureRate = rate === null ? null : 100 - rate
    const abnormal = failureRate !== null && input.finishedDeployments >= 5 && failureRate >= 30
    alerts.push({
      id: 'failed-deployments',
      severity: abnormal ? 'critical' : 'warning',
      title: `${formatInteger(input.failedDeployments)} déploiement${input.failedDeployments > 1 ? 's' : ''} en échec sur la période`,
      detail:
        failureRate === null
          ? 'Aucun déploiement terminé à comparer.'
          : `Taux d’échec de ${formatInteger(failureRate)} % parmi les déploiements terminés.`,
    })
  }

  if (input.pastDueSubscriptions > 0) {
    alerts.push({
      id: 'past-due-subscriptions',
      severity: 'critical',
      title: `${formatInteger(input.pastDueSubscriptions)} abonnement${input.pastDueSubscriptions > 1 ? 's' : ''} impayé${input.pastDueSubscriptions > 1 ? 's' : ''}`,
      detail: 'Un abonnement en retard de paiement doit être relancé ou suspendu.',
    })
  }

  if (input.pendingPayments > 0) {
    alerts.push({
      id: 'pending-payments',
      severity: 'warning',
      title: `${formatInteger(input.pendingPayments)} paiement${input.pendingPayments > 1 ? 's' : ''} en attente`,
      detail: `${formatInteger(input.pendingAmountFcfa)} FCFA à confirmer ou à expirer.`,
    })
  }

  if (input.quotaOverruns.length > 0) {
    const sample = input.quotaOverruns
      .slice(0, 3)
      .map((overrun) => `${overrun.name} (${overrun.kind === 'projects' ? 'projets' : 'membres'} ${overrun.used}/${overrun.limit})`)
      .join(', ')
    const rest = input.quotaOverruns.length - 3
    alerts.push({
      id: 'quota-overruns',
      severity: 'warning',
      title: `${formatInteger(input.quotaOverruns.length)} organisation${input.quotaOverruns.length > 1 ? 's' : ''} au-delà de son quota`,
      detail: `${sample}${rest > 0 ? ` et ${formatInteger(rest)} autre${rest > 1 ? 's' : ''}` : ''}.`,
    })
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

export type AdminMetrics = {
  days: PeriodDays
  users: { total: number; banned: number; new7: number; new30: number; newInPeriod: number }
  organizations: { total: number; activeInPeriod: number }
  projects: { total: number }
  deployments: {
    total: number
    live: number
    failed: number
    other: number
    successRate: number | null
    daily: DailyDeploymentBucket[]
    stacks: StackDeploymentStat[]
  }
  buildDuration: { medianSeconds: number | null; sampleCount: number; available: boolean }
  revenue: RevenueSummary
  unpaid: UnpaidSummary
  quotas: { checkedOrganizations: number; overruns: QuotaOverrun[] }
  alerts: AdminAlert[]
}

export type CsvValue = string | number | null | undefined

/** Échappe une cellule CSV (séparateur `;`, guillemets doublés, formules neutralisées). */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Un tableur interpréterait « = », « + », « - » ou « @ » en tête comme une formule.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Export CSV du tableau de bord. Séparateur point-virgule et dates ISO : lisible
 * dans un tableur français comme dans un script.
 */
export function adminMetricsCsv(metrics: AdminMetrics, generatedAt = new Date()): string {
  const rows: CsvValue[][] = [
    ['Rapport EFLEX — métriques d’administration'],
    ['Période', `${metrics.days} jours`],
    ['Généré le', generatedAt.toISOString()],
    [],
    ['Indicateur', 'Valeur'],
    ['Utilisateurs', metrics.users.total],
    ['Comptes suspendus', metrics.users.banned],
    ['Inscriptions sur 7 jours', metrics.users.new7],
    ['Inscriptions sur 30 jours', metrics.users.new30],
    ['Inscriptions sur la période', metrics.users.newInPeriod],
    ['Organisations', metrics.organizations.total],
    ['Organisations actives sur la période', metrics.organizations.activeInPeriod],
    ['Projets', metrics.projects.total],
    ['Déploiements sur la période', metrics.deployments.total],
    ['Déploiements réussis', metrics.deployments.live],
    ['Déploiements en échec', metrics.deployments.failed],
    ['Déploiements en cours ou annulés', metrics.deployments.other],
    ['Taux de réussite (%)', metrics.deployments.successRate ?? ''],
    ['Durée médiane de build (s)', metrics.buildDuration.medianSeconds ?? ''],
    ['Abonnements actifs', metrics.revenue.activeSubscriptions],
    ['MRR (FCFA)', metrics.revenue.mrrFcfa],
    ['Paiements en attente', metrics.unpaid.pendingPayments],
    ['Montant des paiements en attente (FCFA)', metrics.unpaid.pendingAmountFcfa],
    ['Abonnements impayés', metrics.unpaid.pastDueSubscriptions],
    ['Montant des abonnements impayés (FCFA)', metrics.unpaid.pastDueAmountFcfa],
    [],
    ['Déploiements par jour'],
    ['Jour', 'Réussis', 'Échecs', 'Autres', 'Total'],
    ...metrics.deployments.daily.map((bucket) => [
      bucket.day,
      bucket.live,
      bucket.failed,
      bucket.other,
      bucket.live + bucket.failed + bucket.other,
    ]),
    [],
    ['Taux de réussite par stack'],
    ['Stack', 'Réussis', 'Échecs', 'Autres', 'Total', 'Taux (%)'],
    ...metrics.deployments.stacks.map((stack) => [
      stack.framework,
      stack.live,
      stack.failed,
      stack.other,
      stack.total,
      stack.successRate ?? '',
    ]),
    [],
    ['Alertes'],
    ['Gravité', 'Titre', 'Détail'],
    ...metrics.alerts.map((alert) => [alert.severity, alert.title, alert.detail]),
    [],
    ['Quotas dépassés'],
    ['Organisation', 'Type', 'Utilisé', 'Limite', 'Plan'],
    ...metrics.quotas.overruns.map((overrun) => [
      overrun.name,
      overrun.kind === 'projects' ? 'projets' : 'membres',
      overrun.used,
      overrun.limit,
      overrun.plan,
    ]),
  ]

  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
}

const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const shortDayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDayFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatInteger(value: number): string {
  return integerFormat.format(Number.isFinite(value) ? value : 0)
}

export function formatFcfa(value: number): string {
  return `${formatInteger(value)} FCFA`
}

/** `null` (aucune donnée) s'affiche « — », jamais « 0 % ». */
export function formatPercent(rate: number | null): string {
  return rate === null || !Number.isFinite(rate) ? '—' : `${Math.round(rate)} %`
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes < 60) return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes} min`
}

/** « 2026-11-10 » → « 10 nov. » (UTC, cohérent avec les agrégats). */
export function formatDayShort(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : shortDayFormat.format(date)
}

/** « 2026-11-10 » → « mardi 10 novembre 2026 ». */
export function formatDayLong(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : longDayFormat.format(date)
}
