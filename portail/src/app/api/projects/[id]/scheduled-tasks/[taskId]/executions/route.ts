import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listScheduledTaskExecutions } from '@/lib/coolify'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, taskId } = await params
  const url = new URL(request.url)
  const appId = url.searchParams.get('appId')
  const result = await requireManagedProject(session, id, {
    id: true,
    apps: { orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, coolifyAppId: true, position: true } },
  })
  if ('response' in result) return result.response
  const target = appId ? result.project.apps.find((app) => app.id === appId) : [...result.project.apps].sort((a, b) => a.position - b.position)[0]
  if (!target?.coolifyAppId) return NextResponse.json({ executions: [], unavailable: 'Application non déployée sur l’hébergement.' })
  const executions = await listScheduledTaskExecutions(target.coolifyAppId, taskId)
  if ('error' in executions) return NextResponse.json({ error: executions.error }, { status: 502 })
  return NextResponse.json({ executions: executions.executions })
}
