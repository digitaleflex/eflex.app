import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { requireManagedProject } from '@/lib/tenant'
import { getProjectSiteMonitoring, syncProjectMonitors } from '@/lib/site-monitoring'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const result = await requireManagedProject(session as never, id, { id: true })
  if ('response' in result) return result.response

  try {
    // Synchronise les cibles du projet pour refléter rapidement un domaine ajouté/vérifié.
    await syncProjectMonitors(id).catch(() => undefined)
    const data = await getProjectSiteMonitoring(id)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('[site-monitor] lecture impossible', id, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Impossible de charger la surveillance.' }, { status: 500 })
  }
}
