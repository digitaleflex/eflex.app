import { prisma } from '@/lib/prisma'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import {
  buildAdminAlerts,
  dailyDeploymentSeries,
  deploymentTotals,
  periodStart,
  quotaOverruns,
  revenueSummary,
  startOfUtcDay,
  stackDeploymentStats,
  successRate,
  unpaidSummary,
  type AdminMetrics,
  type PeriodDays,
} from '@/lib/admin-metrics'

const MS_DAY = 86_400_000
const STUCK_AFTER_MS = 30 * 60_000

type DailyRow = { day: string; status: string; count: number }
type StackRow = { framework: string; status: string; count: number }
type CountRow = { count: number }

/**
 * Charge les agrégats du tableau de bord. Chaque indicateur vient d'un `count`,
 * d'un `aggregate`, d'un `groupBy` ou d'une requête SQL agrégée : aucune table
 * n'est chargée ligne par ligne.
 */
export async function loadAdminMetrics(days: PeriodDays, now = new Date()): Promise<AdminMetrics> {
  const since = periodStart(days, now)
  const weekStart = startOfUtcDay(new Date(now.getTime() - 6 * MS_DAY))
  const monthStart = startOfUtcDay(new Date(now.getTime() - 29 * MS_DAY))
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS)

  const [
    usersTotal,
    banned,
    new7,
    new30,
    newInPeriod,
    organizationsTotal,
    projectsTotal,
    dailyRows,
    activeOrganizationRows,
    stackRows,
    stuckDeployments,
    activeSubscriptionAggregate,
    pendingPaymentAggregate,
    pastDueSubscriptionAggregate,
    projectGroups,
    memberGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { banned: true } }),
    prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.organization.count(),
    prisma.project.count(),
    prisma.$queryRaw<DailyRow[]>`
      SELECT to_char(d."createdAt", 'YYYY-MM-DD') AS day,
             d.status AS status,
             COUNT(*)::int AS count
      FROM "Deployment" d
      WHERE d."createdAt" >= ${since}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT p."organizationId")::int AS count
      FROM "Deployment" d
      JOIN "Project" p ON p.id = d."projectId"
      WHERE d."createdAt" >= ${since}
    `,
    prisma.$queryRaw<StackRow[]>`
      SELECT p.framework AS framework,
             d.status AS status,
             COUNT(*)::int AS count
      FROM "Deployment" d
      JOIN "Project" p ON p.id = d."projectId"
      WHERE d."createdAt" >= ${since}
      GROUP BY p.framework, d.status
    `,
    prisma.deployment.count({
      where: {
        status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] },
        createdAt: { lt: stuckBefore },
      },
    }),
    prisma.subscription.aggregate({
      where: { status: { in: ['active', 'trialing'] } },
      _count: { _all: true },
      _sum: { priceFcfa: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'pending' },
      _count: { _all: true },
      _sum: { amountFcfa: true },
    }),
    prisma.subscription.aggregate({
      where: { status: 'past_due' },
      _count: { _all: true },
      _sum: { priceFcfa: true },
    }),
    prisma.project.groupBy({ by: ['organizationId'], _count: { _all: true } }),
    prisma.member.groupBy({ by: ['organizationId'], _count: { _all: true } }),
  ])

  const daily = dailyDeploymentSeries(dailyRows, days, now)
  const totals = deploymentTotals(daily)

  // Une organisation n'est « active » que si elle a déployé sur la période.
  const activeOrganizations = Number(activeOrganizationRows[0]?.count ?? 0)

  const revenue = revenueSummary(
    activeSubscriptionAggregate._count._all,
    activeSubscriptionAggregate._sum.priceFcfa,
  )
  const unpaid = unpaidSummary({
    pendingPayments: pendingPaymentAggregate._count._all,
    pendingAmountFcfa: pendingPaymentAggregate._sum.amountFcfa,
    pastDueSubscriptions: pastDueSubscriptionAggregate._count._all,
    pastDueAmountFcfa: pastDueSubscriptionAggregate._sum.priceFcfa,
  })

  // Quotas : on ne charge que les organisations qui ont des projets ou des membres,
  // une ligne par organisation (pas une ligne par projet).
  const organizationIds = [
    ...new Set([
      ...projectGroups.map((group) => group.organizationId),
      ...memberGroups.map((group) => group.organizationId),
    ]),
  ]
  const organizations =
    organizationIds.length === 0
      ? []
      : await prisma.organization.findMany({
          where: { id: { in: organizationIds } },
          select: {
            id: true,
            name: true,
            subscription: { select: { plan: true, status: true } },
          },
        })

  const overruns = quotaOverruns(
    organizations,
    projectGroups.map((group) => ({ organizationId: group.organizationId, count: group._count._all })),
    memberGroups.map((group) => ({ organizationId: group.organizationId, count: group._count._all })),
  )

  const alerts = buildAdminAlerts({
    failedDeployments: totals.failed,
    finishedDeployments: totals.live + totals.failed,
    stuckDeployments,
    pendingPayments: unpaid.pendingPayments,
    pendingAmountFcfa: unpaid.pendingAmountFcfa,
    pastDueSubscriptions: unpaid.pastDueSubscriptions,
    quotaOverruns: overruns,
  })

  return {
    days,
    users: { total: usersTotal, banned, new7, new30, newInPeriod },
    organizations: { total: organizationsTotal, activeInPeriod: activeOrganizations },
    projects: { total: projectsTotal },
    deployments: {
      total: totals.total,
      live: totals.live,
      failed: totals.failed,
      other: totals.other,
      successRate: successRate(totals.live, totals.failed),
      daily,
      stacks: stackDeploymentStats(stackRows),
    },
    // `Deployment` ne conserve que `createdAt` : aucune durée de build n'est
    // mesurable sans horodatage de fin. L'indicateur reste explicite, jamais inventé.
    buildDuration: { medianSeconds: null, sampleCount: 0, available: false },
    revenue,
    unpaid,
    quotas: { checkedOrganizations: organizations.length, overruns },
    alerts,
  }
}
