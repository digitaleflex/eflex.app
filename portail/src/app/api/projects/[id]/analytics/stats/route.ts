import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

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

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response

  const url = new URL(request.url)
  const days = clampDays(url.searchParams.get('days'))
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  since.setUTCDate(since.getUTCDate() - (days - 1))

  const stats = await prisma.trafficDailyStat.findMany({
    where: { projectId: projectResult.project.id, date: { gte: since } },
    orderBy: [{ date: 'asc' }, { views: 'desc' }],
    select: { date: true, path: true, views: true },
  })

  const byDay = new Map<string, number>()
  const byPath = new Map<string, number>()
  let total = 0
  for (const row of stats) {
    const day = row.date.toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + row.views)
    byPath.set(row.path, (byPath.get(row.path) ?? 0) + row.views)
    total += row.views
  }

  const daysSeries = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, views]) => ({ date, views }))

  const paths = Array.from(byPath.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([path, views]) => ({ path, views }))

  return NextResponse.json({ rangeDays: days, total, days: daysSeries, paths })
}
