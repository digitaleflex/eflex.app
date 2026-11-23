import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { requireManagedProject } from '@/lib/tenant'
import { loadSiteReport, parseMonth } from '@/lib/site-report'

export const dynamic = 'force-dynamic'

/** Rapport d'exploitation mensuel d'un projet (#178) : données collectées uniquement. `?month=AAAA-MM`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const result = await requireManagedProject(session as never, id, { id: true, name: true })
  if ('response' in result) return result.response
  const period = parseMonth(new URL(request.url).searchParams.get('month'))
  if (!period) return NextResponse.json({ error: 'Mois invalide (format AAAA-MM).' }, { status: 400 })
  const report = await loadSiteReport(id, period)
  return NextResponse.json({ project: { id, name: result.project.name }, report }, { headers: { 'Cache-Control': 'no-store' } })
}
