import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { executeScheduledTask } from '@/lib/coolify'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { requireManagedProject } from '@/lib/tenant'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
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
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas d’exécuter cette tâche.' }, { status: 403 })
  }
  const target = appId ? result.project.apps.find((app) => app.id === appId) : [...result.project.apps].sort((a, b) => a.position - b.position)[0]
  if (!target?.coolifyAppId) return NextResponse.json({ error: 'Application non déployée sur l’hébergement.' }, { status: 409 })
  const executed = await executeScheduledTask(target.coolifyAppId, taskId)
  if ('error' in executed) return NextResponse.json({ error: executed.error }, { status: 502 })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.scheduled-task.execute',
    target: { type: 'project', id },
    organizationId: org.organizationId,
    details: { taskId },
    request,
  })
  return NextResponse.json({ ok: true }, { status: 202 })
}
