import { NextResponse } from 'next/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import {
  createProjectCoolifyService,
  discoverServiceTypeCapabilities,
  listProjectCoolifyServices,
} from '@/lib/project-coolify-services'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ catalogId: z.string().min(1).max(64) })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response

  const [services, capabilities] = await Promise.all([
    listProjectCoolifyServices(result.project.slug),
    discoverServiceTypeCapabilities(),
  ])
  if ('error' in services) return NextResponse.json({ error: services.error }, { status: 502 })

  return NextResponse.json({ services: services.services, capabilities })
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

  // Alignement avec les capacités réellement annoncées par l’instance (si découverte fiable).
  const capabilities = await discoverServiceTypeCapabilities()
  const cap = capabilities.byCatalogId[parsed.data.catalogId]
  if (cap && !cap.provisionable && capabilities.source === 'instance') {
    return NextResponse.json({
      error: cap.reason ?? "Ce type de service n’est pas supporté par l’instance d’hébergement.",
      capabilities,
    }, { status: 400 })
  }

  const created = await createProjectCoolifyService(result.project.slug, parsed.data.catalogId, org.organizationId)
  if ('error' in created) return NextResponse.json({ error: created.error, capabilities }, { status: created.status ?? 502 })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.coolify_service.create',
    target: { type: 'coolify_service', id: created.service.id },
    organizationId: org.organizationId,
    details: { projectId: id, catalogId: created.service.catalogId },
    request,
  })

  return NextResponse.json({ service: created.service, capabilities }, { status: 201 })
}
