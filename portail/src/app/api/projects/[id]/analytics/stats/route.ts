import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { assertProjectManager, requireManagedProject, requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'
import { deleteAllTrafficStatsForProject, purgeTrafficStatsForProject } from '@/lib/analytics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_DAYS = 90
const DEFAULT_DAYS = 30

function clampDays(value: string | null): number {
  const n = value ? Number.parseInt(value, 10) : DEFAULT_DAYS
  if (!Number.isFinite(n)) return DEFAULT_DAYS
  return Math.min(MAX_DAYS, Math.max(1, n))
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const scoped = await requireManagedProject(session, id, { id: true })
  if ('response' in scoped) return scoped.response
  const projectId = scoped.project.id

  // Applique la rétention configurée : les statistiques expirées ne sont ni exposées ni conservées.
  await purgeTrafficStatsForProject(prisma, projectId)

  const url = new URL(request.url)
  const days = clampDays(url.searchParams.get('days'))
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  since.setUTCDate(since.getUTCDate() - (days - 1))
  const previousSince = new Date(since)
  previousSince.setUTCDate(previousSince.getUTCDate() - days)

  const [stats, prevStats, eventStats, prevEventStats, config, siteStats, prevSiteStats, dimensionStats] = await Promise.all([
    prisma.trafficDailyStat.findMany({
      where: { projectId, date: { gte: since } },
      orderBy: [{ date: 'asc' }, { views: 'desc' }],
      select: { date: true, path: true, views: true },
    }),
    prisma.trafficDailyStat.findMany({
      where: { projectId, date: { gte: previousSince, lt: since } },
      select: { date: true, views: true },
    }),
    prisma.analyticsEventDaily.findMany({
      where: { projectId, date: { gte: since } },
      orderBy: [{ date: 'asc' }, { count: 'desc' }],
      select: { date: true, name: true, count: true },
    }),
    prisma.analyticsEventDaily.findMany({
      where: { projectId, date: { gte: previousSince, lt: since } },
      select: { count: true },
    }),
    prisma.projectAnalytics.findUnique({
      where: { projectId },
      select: { goalEvents: true, lastReceivedAt: true, enabled: true },
    }),
    prisma.trafficDailySiteStat.findMany({
      where: { projectId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, views: true, visitors: true },
    }),
    prisma.trafficDailySiteStat.findMany({
      where: { projectId, date: { gte: previousSince, lt: since } },
      orderBy: { date: 'asc' },
      select: { visitors: true, views: true },
    }),
    prisma.trafficDailyDimension.findMany({
      where: { projectId, date: { gte: since } },
      select: { dimension: true, value: true, views: true, visitors: true },
    }),
  ])

  const byDay = new Map<string, number>()
  const byPath = new Map<string, number>()
  let total = 0
  for (const row of stats) {
    const day = row.date.toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + row.views)
    byPath.set(row.path, (byPath.get(row.path) ?? 0) + row.views)
    total += row.views
  }

  const visitorsByDay = new Map<string, number>()
  let totalVisitors = 0
  for (const row of siteStats) {
    const day = row.date.toISOString().slice(0, 10)
    visitorsByDay.set(day, row.visitors)
    totalVisitors += row.visitors
  }

  const allDays = new Set<string>([...byDay.keys(), ...visitorsByDay.keys()])
  const daysSeries = Array.from(allDays)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({ date, views: byDay.get(date) ?? 0, visitors: visitorsByDay.get(date) ?? 0 }))

  const paths = Array.from(byPath.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([path, views]) => ({ path, views }))

  const goalSet = new Set(config?.goalEvents ?? [])
  const byEvent = new Map<string, number>()
  for (const row of eventStats) {
    byEvent.set(row.name, (byEvent.get(row.name) ?? 0) + row.count)
  }
  const events = Array.from(byEvent.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, count]) => ({ name, count, goal: goalSet.has(name) }))

  let previousTotal = 0
  const prevDays = new Set<string>()
  for (const row of prevStats) {
    previousTotal += row.views
    prevDays.add(row.date.toISOString().slice(0, 10))
  }
  let previousVisitors = 0
  for (const row of prevSiteStats) previousVisitors += row.visitors
  let previousEvents = 0
  for (const row of prevEventStats) previousEvents += row.count

  const changePct =
    previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : total > 0 ? 100 : 0
  const visitorsChangePct =
    previousVisitors > 0
      ? Math.round(((totalVisitors - previousVisitors) / previousVisitors) * 100)
      : totalVisitors > 0
        ? 100
        : 0

  const dimAgg = new Map<string, { views: number; visitors: number }>()
  for (const row of dimensionStats) {
    const key = `${row.dimension}\0${row.value}`
    const cur = dimAgg.get(key) ?? { views: 0, visitors: 0 }
    cur.views += row.views
    cur.visitors += row.visitors
    dimAgg.set(key, cur)
  }
  function topDimension(dimension: string, limit = 20) {
    return Array.from(dimAgg.entries())
      .filter(([k]) => k.startsWith(`${dimension}\0`))
      .map(([k, v]) => ({ value: k.slice(dimension.length + 1), views: v.views, visitors: v.visitors }))
      .sort((a, b) => b.views - a.views || b.visitors - a.visitors)
      .slice(0, limit)
  }

  return NextResponse.json({
    rangeDays: days,
    total,
    totalVisitors,
    visitorsAggregation: 'sum_daily_unique',
    days: daysSeries,
    paths,
    events,
    referrers: topDimension('referrer'),
    devices: topDimension('device'),
    browsers: topDimension('browser'),
    operatingSystems: topDimension('os'),
    goalEvents: config?.goalEvents ?? [],
    comparison: {
      previousTotal,
      previousActiveDays: prevDays.size,
      changePct,
      previousVisitors,
      visitorsChangePct,
      previousEvents,
    },
    installation: {
      enabled: config?.enabled ?? false,
      lastReceivedAt: config?.lastReceivedAt ? config.lastReceivedAt.toISOString() : null,
    },
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const denied = assertProjectManager(org)
  if (denied) return denied

  const userLimit = await check(`analytics-delete:${session.user.id}`, 10, 60_000, { action: 'analytics-delete', scope: 'user' })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop de suppressions en peu de temps. Patientez une minute.')
  }
  const orgLimit = await checkOrg(org.organizationId, 'analytics-delete', 20, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop de suppressions pour cette organisation. Patientez une minute.')
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response

  const deleted = await deleteAllTrafficStatsForProject(prisma, projectResult.project.id)

  await audit({
    actor: { id: session.user.id, email: session.user.email ?? '' },
    action: 'project.analytics.stats.delete',
    target: { type: 'project', id: projectResult.project.id },
    organizationId: org.organizationId,
    details: { deleted },
    request,
  })

  return NextResponse.json({ deleted })
}
