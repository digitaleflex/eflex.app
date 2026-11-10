import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { adminMetricsCsv, parsePeriodDays } from '@/lib/admin-metrics'
import { loadAdminMetrics } from '@/lib/admin-metrics-data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Export CSV des indicateurs du tableau de bord, pour la période demandée. */
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const days = parsePeriodDays(new URL(request.url).searchParams.get('days'))
  const generatedAt = new Date()
  const metrics = await loadAdminMetrics(days, generatedAt)

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'metrics.export',
    target: { type: 'metrics', id: `dashboard-${days}d` },
    details: { days, format: 'csv' },
    request,
  })

  const filename = `eflex-metriques-${days}j-${generatedAt.toISOString().slice(0, 10)}.csv`
  return new NextResponse(`\uFEFF${adminMetricsCsv(metrics, generatedAt)}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
