import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { Building2, Filter, TriangleAlert } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PLAN_IDS, PLANS } from '@/lib/plans'
import { computeBillingState } from '@/lib/billing'
import { TimeFr } from '@/components/admin/time-fr'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Organisations — Administration Eflex' }
export const dynamic = 'force-dynamic'

type Search = { plan?: string; paiement?: string; suspendue?: string; inactive?: string; vue?: string }

const INACTIVE_DAYS = [30, 60, 90] as const

/** Statut lisible d'une organisation pour la liste et la vue « à surveiller ». */
function flags(state: ReturnType<typeof computeBillingState>, inactiveDays: number | null, usage: { projects: number; members: number }) {
  const out: { label: string; tone: 'warning' | 'destructive' | 'outline' | 'success' }[] = []
  if (state.suspended) out.push({ label: 'Suspendue', tone: 'destructive' })
  if (state.phase === 'past_due') {
    out.push(
      state.blocked
        ? { label: 'Impayé — bloquée', tone: 'destructive' }
        : { label: `Impayé — grâce ${state.graceDaysLeft ?? 0} j`, tone: 'warning' },
    )
  }
  if (state.phase === 'expired') out.push({ label: 'Période échue', tone: 'warning' })
  if (usage.projects >= state.limits.projects || usage.members >= state.limits.members) {
    out.push({ label: 'Quota atteint', tone: 'warning' })
  }
  if (inactiveDays != null && inactiveDays >= 60) out.push({ label: `Inactive ${inactiveDays} j`, tone: 'outline' })
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
  const [auditMax, projectMax, pendingInvitations] = await Promise.all([
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
  ])
  const lastAudit = new Map(auditMax.map((row) => [row.organizationId, row._max.createdAt]))
  const lastProject = new Map(projectMax.map((row) => [row.organizationId, row._max.updatedAt]))
  const pending = new Map(pendingInvitations.map((row) => [row.organizationId, row._count._all]))

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
      const usage = { projects: organization._count.projects, members: organization._count.members }
      const activity = [lastAudit.get(organization.id), lastProject.get(organization.id), organization.createdAt]
        .filter((value): value is Date => value instanceof Date)
        .reduce((latest, value) => (value > latest ? value : latest), organization.createdAt)
      const inactive = Math.floor((now.getTime() - activity.getTime()) / 86_400_000)
      return { organization, state, usage, activity, inactive, badges: flags(state, inactive, usage) }
    })
    .filter((row) => inactiveDays == null || row.inactive >= inactiveDays)

  const attention = rows.filter((row) =>
    row.state.suspended || row.state.blocked || row.state.phase === 'past_due' || row.state.phase === 'expired' ||
    row.usage.projects >= row.state.limits.projects || row.usage.members >= row.state.limits.members || row.inactive >= 60,
  )
  const displayed = filters.vue === 'attention' ? attention : rows

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organisations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plans, consommation, impayés et suspension. Une suspension ne supprime ni projet ni application en ligne.
        </p>
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="filter-plan" className="text-sm font-medium">Plan</label>
            <select
              id="filter-plan"
              name="plan"
              defaultValue={filters.plan ?? ''}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Tous les plans</option>
              {PLAN_IDS.map((id) => <option key={id} value={id}>{PLANS[id].label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="filter-paiement" className="text-sm font-medium">Paiement</label>
            <select
              id="filter-paiement"
              name="paiement"
              defaultValue={filters.paiement ?? ''}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Tous</option>
              <option value="past_due">Impayé (past_due)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="filter-suspendue" className="text-sm font-medium">Suspension</label>
            <select
              id="filter-suspendue"
              name="suspendue"
              defaultValue={filters.suspendue ?? ''}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Toutes</option>
              <option value="1">Suspendues</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="filter-inactive" className="text-sm font-medium">Inactive depuis</label>
            <select
              id="filter-inactive"
              name="inactive"
              defaultValue={filters.inactive ?? ''}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Peu importe</option>
              {INACTIVE_DAYS.map((days) => <option key={days} value={days}>{days} jours</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="filter-vue" className="text-sm font-medium">Vue</label>
            <select
              id="filter-vue"
              name="vue"
              defaultValue={filters.vue ?? ''}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Toutes</option>
              <option value="attention">À surveiller</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtrer
          </button>
          <Link href="/admin/organizations" className="text-sm text-muted-foreground underline underline-offset-4">
            Réinitialiser
          </Link>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums">{displayed.length}</span> organisation{displayed.length > 1 ? 's' : ''} affichée{displayed.length > 1 ? 's' : ''}
          {filters.vue === 'attention' && ' · vue « à surveiller »'}
        </p>
        <Link tabIndex={-1} href="/admin/organizations?vue=attention" className="text-sm font-medium text-primary hover:underline">
          Voir à surveiller ({attention.length})
        </Link>
      </div>

      {displayed.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-muted-foreground">Aucune organisation ne correspond à ces filtres.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map(({ organization, state, usage, activity, badges }) => (
            <Card key={organization.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <Link href={`/admin/organizations/${organization.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {organization.name}
                    </Link>
                    <Badge variant="outline">{state.plan.label}</Badge>
                    {badges.map((badge) => (
                      <Badge key={badge.label} variant={badge.tone}>{badge.label}</Badge>
                    ))}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {organization.slug} · {usage.members} membre{usage.members > 1 ? 's' : ''} ·{' '}
                    {usage.projects} / <span className="tabular-nums">{state.limits.projects}</span> projet{usage.projects > 1 ? 's' : ''} ·{' '}
                    <span className="tabular-nums">{pending.get(organization.id) ?? 0}</span> invitation
                    {(pending.get(organization.id) ?? 0) > 1 ? 's' : ''} en attente · créée le{' '}
                    <TimeFr value={organization.createdAt} dateOnly />
                  </p>
                  {organization.suspendedAt && organization.suspensionReason && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Motif : {organization.suspensionReason}
                    </p>
                  )}
                  {state.phase === 'past_due' && state.graceUntil && (
                    <p className="mt-1 text-xs text-warning">
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
                  <Link href={`/admin/organizations/${organization.id}`} className="mt-2 inline-block font-medium text-primary hover:underline">
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
