import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { Building2, Filter, ShieldAlert, TriangleAlert, Wallet } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { PLAN_IDS, PLANS } from '@/lib/plans'
import { computeBillingState } from '@/lib/billing'
import { TimeFr } from '@/components/admin/time-fr'
import { formatInteger } from '@/lib/table'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Organisations — Administration' }
export const dynamic = 'force-dynamic'

type Search = { plan?: string; paiement?: string; suspendue?: string; inactive?: string; vue?: string }

const INACTIVE_DAYS = [30, 60, 90] as const

/** Statut lisible d'une organisation pour la liste et la vue « à surveiller ». */
function flags(
  state: ReturnType<typeof computeBillingState>,
  inactiveDays: number | null,
  usage: { apps: number; members: number },
) {
  const out: { label: string; tone: StatusTone }[] = []
  if (state.suspended) out.push({ label: 'Suspendue', tone: 'destructive' })
  if (state.phase === 'past_due') {
    out.push(
      state.blocked
        ? { label: 'Impayé — bloquée', tone: 'destructive' }
        : { label: `Impayé — grâce ${state.graceDaysLeft ?? 0} j`, tone: 'warning' },
    )
  }
  if (state.phase === 'expired') out.push({ label: 'Période échue', tone: 'warning' })
  // Le quota « projets » de `limits` est compté en applications (D2).
  if (usage.apps >= state.limits.projects || usage.members >= state.limits.members) {
    out.push({ label: 'Quota atteint', tone: 'warning' })
  }
  if (inactiveDays != null && inactiveDays >= 60) out.push({ label: `Inactive ${inactiveDays} j`, tone: 'neutral' })
  if (out.length === 0) out.push({ label: 'À jour', tone: 'success' })
  return out
}

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const filters = await searchParams
  const now = new Date()
  const inactiveThreshold = filters.inactive ? Number(filters.inactive) : null
  const inactiveDays = inactiveThreshold != null && Number.isFinite(inactiveThreshold) ? inactiveThreshold : null

  const where: Prisma.OrganizationWhereInput = {}
  const subscriptionFilter: Prisma.SubscriptionWhereInput = {}
  if (filters.plan && (PLAN_IDS as string[]).includes(filters.plan)) {
    subscriptionFilter.plan = filters.plan
  }
  if (filters.paiement === 'past_due') subscriptionFilter.status = 'past_due'
  if (Object.keys(subscriptionFilter).length > 0) {
    // Une organisation sans ligne Subscription est de fait au plan gratuit.
    if (filters.plan === 'free' && filters.paiement !== 'past_due') {
      where.OR = [{ subscription: { is: null } }, { subscription: { is: { plan: 'free' } } }]
    } else {
      where.subscription = subscriptionFilter
    }
  }
  if (filters.suspendue === '1') where.suspendedAt = { not: null }

  const organizations = await prisma.organization.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      suspendedAt: true,
      suspensionReason: true,
      subscription: true,
      _count: { select: { members: true, projects: true } },
    },
  })

  const ids = organizations.map((org) => org.id)
  const [auditMax, projectMax, pendingInvitations, appRows, implicitProjectRows] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: ids } },
      _max: { createdAt: true },
    }),
    prisma.project.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: ids } },
      _max: { updatedAt: true },
    }),
    prisma.invitation.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: ids }, status: 'pending' },
      _count: { _all: true },
    }),
    prisma.projectApp.findMany({
      where: { project: { organizationId: { in: ids } } },
      select: { project: { select: { organizationId: true } } },
    }),
    prisma.project.findMany({
      where: { organizationId: { in: ids }, apps: { none: {} } },
      select: { organizationId: true },
    }),
  ])
  const lastAudit = new Map(auditMax.map((row) => [row.organizationId, row._max.createdAt]))
  const lastProject = new Map(projectMax.map((row) => [row.organizationId, row._max.updatedAt]))
  const pending = new Map(pendingInvitations.map((row) => [row.organizationId, row._count._all]))
  const appCounts = new Map<string, number>()
  for (const row of appRows) {
    const orgId = row.project.organizationId
    appCounts.set(orgId, (appCounts.get(orgId) ?? 0) + 1)
  }
  const implicitCounts = new Map<string, number>()
  for (const row of implicitProjectRows) {
    implicitCounts.set(row.organizationId, (implicitCounts.get(row.organizationId) ?? 0) + 1)
  }

  const rows = organizations
    .map((organization) => {
      const state = computeBillingState(
        {
          organizationId: organization.id,
          suspendedAt: organization.suspendedAt,
          suspensionReason: organization.suspensionReason,
          subscription: organization.subscription,
        },
        now,
      )
      const usage = {
        projects: organization._count.projects,
        members: organization._count.members,
        apps: (appCounts.get(organization.id) ?? 0) + (implicitCounts.get(organization.id) ?? 0),
      }
      const activity = [lastAudit.get(organization.id), lastProject.get(organization.id), organization.createdAt]
        .filter((value): value is Date => value instanceof Date)
        .reduce((latest, value) => (value > latest ? value : latest), organization.createdAt)
      const inactive = Math.floor((now.getTime() - activity.getTime()) / 86_400_000)
      return { organization, state, usage, activity, inactive, badges: flags(state, inactive, usage) }
    })
    .filter((row) => inactiveDays == null || row.inactive >= inactiveDays)

  const attention = rows.filter((row) =>
    row.state.suspended || row.state.blocked || row.state.phase === 'past_due' || row.state.phase === 'expired' ||
    row.usage.apps >= row.state.limits.projects || row.usage.members >= row.state.limits.members || row.inactive >= 60,
  )
  const displayed = filters.vue === 'attention' ? attention : rows
  const suspendedCount = rows.filter((row) => row.state.suspended).length
  const pastDueCount = rows.filter((row) => row.state.phase === 'past_due').length
  const blockedCount = rows.filter((row) => row.state.blocked).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        description="Plans, consommation, impayés et suspension. Une suspension ne supprime ni projet ni application en ligne."
        actions={
          <Link href="/admin/organizations?vue=attention" className="text-sm font-medium text-primary hover:underline">
            Voir à surveiller ({formatInteger(attention.length)})
          </Link>
        }
      />

      <section aria-label="Indicateurs des organisations" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Organisations affichées"
          value={formatInteger(displayed.length)}
          hint={
            filters.vue === 'attention'
              ? `Vue « à surveiller » · ${formatInteger(rows.length)} chargée${rows.length > 1 ? 's' : ''} après filtres`
              : `${formatInteger(rows.length)} chargée${rows.length > 1 ? 's' : ''} après filtres`
          }
          icon={Building2}
        />
        <StatCard
          label="À surveiller"
          value={formatInteger(attention.length)}
          hint="Impayé, suspension, quota atteint ou inactivité prolongée"
          icon={TriangleAlert}
          tone={attention.length > 0 ? 'warning' : 'neutral'}
          href="/admin/organizations?vue=attention"
        />
        <StatCard
          label="Impayés (past_due)"
          value={formatInteger(pastDueCount)}
          hint={`${formatInteger(blockedCount)} bloquée${blockedCount > 1 ? 's' : ''} (déploiements bloqués)`}
          icon={Wallet}
          tone={pastDueCount > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Suspendues"
          value={formatInteger(suspendedCount)}
          hint="Créations et nouveaux déploiements gelés"
          icon={ShieldAlert}
          tone={suspendedCount > 0 ? 'critical' : 'neutral'}
        />
      </section>

      <Card>
        <CardHeader className="border-b border-border pb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Filtres
          </h2>
        </CardHeader>
        <CardContent className="pt-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-[11rem]">
              <Select
                name="plan"
                label="Plan"
                defaultValue={filters.plan ?? ''}
                options={[{ value: '', label: 'Tous les plans' }, ...PLAN_IDS.map((id) => ({ value: id, label: PLANS[id].label }))]}
              />
            </div>
            <div className="min-w-[11rem]">
              <Select
                name="paiement"
                label="Paiement"
                defaultValue={filters.paiement ?? ''}
                options={[
                  { value: '', label: 'Tous' },
                  { value: 'past_due', label: 'Impayé (past_due)' },
                ]}
              />
            </div>
            <div className="min-w-[11rem]">
              <Select
                name="suspendue"
                label="Suspension"
                defaultValue={filters.suspendue ?? ''}
                options={[
                  { value: '', label: 'Toutes' },
                  { value: '1', label: 'Suspendues' },
                ]}
              />
            </div>
            <div className="min-w-[11rem]">
              <Select
                name="inactive"
                label="Inactive depuis"
                defaultValue={filters.inactive ?? ''}
                options={[
                  { value: '', label: 'Peu importe' },
                  ...INACTIVE_DAYS.map((days) => ({ value: String(days), label: `${days} jours` })),
                ]}
              />
            </div>
            <div className="min-w-[11rem]">
              <Select
                name="vue"
                label="Vue"
                defaultValue={filters.vue ?? ''}
                options={[
                  { value: '', label: 'Toutes' },
                  { value: 'attention', label: 'À surveiller' },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-0.5">
              <Button type="submit">
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filtrer
              </Button>
              <Link href="/admin/organizations" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4">
                Réinitialiser
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums">{formatInteger(displayed.length)}</span> organisation{displayed.length > 1 ? 's' : ''} affichée{displayed.length > 1 ? 's' : ''}
          {filters.vue === 'attention' && ' · vue « à surveiller »'}
        </p>
        <Link href="/admin/organizations?vue=attention" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
          Voir à surveiller ({formatInteger(attention.length)})
        </Link>
      </div>

      {displayed.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Aucune organisation trouvée"
            description="Aucune organisation ne correspond à ces filtres. Modifiez les critères ou réinitialisez la recherche."
            action={
              <Link href="/admin/organizations" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
                Réinitialiser les filtres
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map(({ organization, state, usage, activity, badges }) => (
            <Card key={organization.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    <Link href={`/admin/organizations/${organization.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {organization.name}
                    </Link>
                    <StatusBadge status={state.plan.id} label={state.plan.label} tone="neutral" dot={false} />
                    {badges.map((badge) => (
                      <StatusBadge key={badge.label} status={badge.label} label={badge.label} tone={badge.tone} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {organization.slug} · {formatInteger(usage.members)} membre{usage.members > 1 ? 's' : ''} ·{' '}
                    {formatInteger(usage.projects)} projet{usage.projects > 1 ? 's' : ''} ·{' '}
                    <span className="tabular-nums">{formatInteger(usage.apps)} / {formatInteger(state.limits.projects)}</span> application{state.limits.projects > 1 ? 's' : ''} ·{' '}
                    <span className="tabular-nums">{formatInteger(pending.get(organization.id) ?? 0)}</span> invitation
                    {(pending.get(organization.id) ?? 0) > 1 ? 's' : ''} en attente · créée le{' '}
                    <TimeFr value={organization.createdAt} dateOnly />
                  </p>
                  {organization.suspendedAt && organization.suspensionReason && (
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Motif : {organization.suspensionReason}
                    </p>
                  )}
                  {state.phase === 'past_due' && state.graceUntil && (
                    <p className="text-xs text-warning">
                      Grâce jusqu’au <TimeFr value={state.graceUntil} /> ·{' '}
                      {state.blocked ? 'déploiements bloqués' : 'déploiements encore autorisés'}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Dernière activité</p>
                  <p className={cn('font-medium', state.blocked && 'text-destructive')}>
                    <TimeFr value={activity} />
                  </p>
                  <Link href={`/admin/organizations/${organization.id}`} className="mt-2 inline-flex min-h-11 items-center font-medium text-primary hover:underline">
                    Ouvrir la fiche
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
