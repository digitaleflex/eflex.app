import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { assertProjectManager, requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'
import { purgeTrafficStatsForProject } from '@/lib/analytics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const denied = assertProjectManager(org)
  if (denied) return denied

  const userLimit = await check(`analytics-export:${session.user.id}`, 20, 60_000, { action: 'analytics-export', scope: 'user' })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop d’exports en peu de temps. Patientez une minute.')
  }
  const orgLimit = await checkOrg(org.organizationId, 'analytics-export', 40, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop d’exports pour cette organisation. Patientez une minute.')
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response
  const projectId = projectResult.project.id

  // L'export reflète les données effectivement conservées selon la rétention.
  await purgeTrafficStatsForProject(prisma, projectId)

  const [rows, eventRows, config, siteRows, dimensionRows] = await Promise.all([
    prisma.trafficDailyStat.findMany({
      where: { projectId },
      orderBy: [{ date: 'asc' }, { path: 'asc' }],
      select: { date: true, path: true, views: true },
    }),
    prisma.analyticsEventDaily.findMany({
      where: { projectId },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
      select: { date: true, name: true, count: true },
    }),
    prisma.projectAnalytics.findUnique({ where: { projectId }, select: { goalEvents: true } }),
    prisma.trafficDailySiteStat.findMany({
      where: { projectId },
      orderBy: [{ date: 'asc' }],
      select: { date: true, views: true, visitors: true },
    }),
    prisma.trafficDailyDimension.findMany({
      where: { projectId },
      orderBy: [{ date: 'asc' }, { dimension: 'asc' }, { views: 'desc' }],
      select: { date: true, dimension: true, value: true, views: true, visitors: true },
    }),
  ])

  const data = rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    path: row.path,
    views: row.views,
  }))
  const goalSet = new Set(config?.goalEvents ?? [])
  const eventData = eventRows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    name: row.name,
    count: row.count,
    goal: goalSet.has(row.name),
  }))
  const dailyTotals = siteRows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    views: row.views,
    visitors: row.visitors,
  }))
  const dimensions = dimensionRows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    dimension: row.dimension,
    value: row.value,
    views: row.views,
    visitors: row.visitors,
  }))

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'

  await audit({
    actor: { id: session.user.id, email: session.user.email ?? '' },
    action: 'project.analytics.export',
    target: { type: 'project', id: projectId },
    organizationId: org.organizationId,
    details: {
      format,
      pageviewRows: data.length,
      eventRows: eventData.length,
      dailyTotalRows: dailyTotals.length,
      dimensionRows: dimensions.length,
    },
    request,
  })

  if (format === 'csv') {
    const header = 'type,date,key,count,visitors,goal'
    const trafficLines = data.map(
      (row) => `pageview,${row.date},${escapeCsv(row.path)},${row.views},,`,
    )
    const eventLines = eventData.map(
      (row) => `event,${row.date},${escapeCsv(row.name)},${row.count},,${row.goal ? 'true' : 'false'}`,
    )
    const dailyLines = dailyTotals.map(
      (row) => `daily_total,${row.date},,${row.views},${row.visitors},`,
    )
    const dimensionLines = dimensions.map(
      (row) => `dimension,${row.date},${escapeCsv(`${row.dimension}:${row.value}`)},${row.views},${row.visitors},`,
    )
    const csv = [header, ...trafficLines, ...eventLines, ...dailyLines, ...dimensionLines].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="analytics-${projectId}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({
    projectId,
    exportedAt: new Date().toISOString(),
    retentionApplied: true,
    rows: data,
    events: eventData,
    dailyTotals,
    visitorsAggregation: 'sum_daily_unique',
    dimensions,
    goalEvents: config?.goalEvents ?? [],
  })
}
