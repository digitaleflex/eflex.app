import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
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

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response
  const projectId = projectResult.project.id

  // L'export reflète les données effectivement conservées selon la rétention.
  await purgeTrafficStatsForProject(prisma, projectId)

  const rows = await prisma.trafficDailyStat.findMany({
    where: { projectId },
    orderBy: [{ date: 'asc' }, { path: 'asc' }],
    select: { date: true, path: true, views: true },
  })

  const data = rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    path: row.path,
    views: row.views,
  }))

  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  if (format === 'csv') {
    const header = 'date,path,views'
    const lines = data.map((row) => `${row.date},${escapeCsv(row.path)},${row.views}`)
    const csv = [header, ...lines].join('\n')
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
  })
}
