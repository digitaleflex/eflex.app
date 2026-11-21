import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  try {
    const [monitors, incidents, counts] = await Promise.all([
      prisma.projectSiteMonitor.findMany({
        where: { enabled: true },
        include: {
          project: { select: { id: true, name: true, slug: true, organization: { select: { id: true, name: true, slug: true } } } },
        },
        orderBy: [{ lastStatus: 'asc' }, { lastCheckedAt: 'desc' }],
        take: 200,
      }),
      prisma.projectSiteIncident.findMany({
        include: {
          project: { select: { id: true, name: true, organization: { select: { id: true, name: true } } } },
        },
        orderBy: { openedAt: 'desc' },
        take: 100,
      }),
      prisma.projectSiteIncident.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ])

    const openMonitorIds = new Set(incidents.filter((i) => i.status === 'open').map((i) => i.monitorId))

    return NextResponse.json(
      {
        monitors: monitors.map((m) => ({
          id: m.id,
          host: m.host,
          label: m.label,
          lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
          lastStatus: m.lastStatus,
          lastHttpStatus: m.lastHttpStatus,
          lastLatencyMs: m.lastLatencyMs,
          lastDnsOk: m.lastDnsOk,
          lastTlsOk: m.lastTlsOk,
          lastTlsExpiresAt: m.lastTlsExpiresAt?.toISOString() ?? null,
          lastError: m.lastError,
          hasOpenIncident: openMonitorIds.has(m.id),
          project: {
            id: m.project.id,
            name: m.project.name,
            slug: m.project.slug,
            organization: m.project.organization,
          },
        })),
        incidents: incidents.map((i) => ({
          id: i.id,
          host: i.host,
          status: i.status,
          cause: i.cause,
          summary: i.summary,
          details: i.details,
          openedAt: i.openedAt.toISOString(),
          resolvedAt: i.resolvedAt?.toISOString() ?? null,
          project: {
            id: i.project.id,
            name: i.project.name,
            organization: i.project.organization,
          },
        })),
        counts: {
          open: counts.find((c) => c.status === 'open')?._count._all ?? 0,
          resolved: counts.find((c) => c.status === 'resolved')?._count._all ?? 0,
          monitored: monitors.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('[admin/monitoring] lecture impossible', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Impossible de charger la surveillance.' }, { status: 500 })
  }
}
