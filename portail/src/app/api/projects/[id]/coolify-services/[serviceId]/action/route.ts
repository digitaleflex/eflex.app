import { NextResponse } from 'next/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { getSession } from '@/lib/session'
import { deleteServiceInstance, listProjectCoolifyServices, serviceAction } from '@/lib/project-coolify-services'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ action: z.enum(['start', 'stop', 'restart']) })

async function ensureOwned(projectSlug: string, serviceId: string): Promise<boolean> {
  const listed = await listProjectCoolifyServices(projectSlug)
  if ('error' in listed) return false
  return listed.services.some((s) => s.id === serviceId)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, serviceId } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  if (!(await ensureOwned(result.project.slug, serviceId))) return NextResponse.json({ error: 'Service introuvable.' }, { status: 404 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Action invalide.' }, { status: 400 })
  const acted = await serviceAction(serviceId, parsed.data.action)
  if ('error' in acted) return NextResponse.json({ error: acted.error }, { status: 502 })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.coolify_service.action',
    target: { type: 'coolify_service', id: serviceId },
    organizationId: org.organizationId,
    details: { projectId: id, serviceAction: parsed.data.action },
    request,
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, serviceId } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  if (!(await ensureOwned(result.project.slug, serviceId))) return NextResponse.json({ error: 'Service introuvable.' }, { status: 404 })
  const deleted = await deleteServiceInstance(serviceId)
  if ('error' in deleted) return NextResponse.json({ error: deleted.error }, { status: 502 })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.coolify_service.delete',
    target: { type: 'coolify_service', id: serviceId },
    organizationId: org.organizationId,
    details: { projectId: id },
    request,
  })
  return NextResponse.json({ ok: true })
}
