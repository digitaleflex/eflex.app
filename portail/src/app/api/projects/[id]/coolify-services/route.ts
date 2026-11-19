import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { createProjectCoolifyService, listProjectCoolifyServices } from '@/lib/project-coolify-services'
import { requireManagedProject } from '@/lib/tenant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ catalogId: z.string().min(1).max(64) })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response
  const services = await listProjectCoolifyServices(result.project.slug)
  if ('error' in services) return NextResponse.json({ error: services.error }, { status: 502 })
  return NextResponse.json({ services: services.services })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de provisionner des services.' }, { status: 403 })
  }
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
  const created = await createProjectCoolifyService(result.project.slug, parsed.data.catalogId)
  if ('error' in created) return NextResponse.json({ error: created.error }, { status: created.status ?? 502 })
  return NextResponse.json({ service: created.service }, { status: 201 })
}
