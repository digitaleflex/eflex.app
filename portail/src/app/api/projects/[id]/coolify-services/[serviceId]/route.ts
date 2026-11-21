import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getProjectServiceConfig, listProjectCoolifyServices } from '@/lib/project-coolify-services'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function ensureOwned(projectSlug: string, serviceId: string): Promise<boolean> {
  const listed = await listProjectCoolifyServices(projectSlug)
  if ('error' in listed) return false
  return listed.services.some((s) => s.id === serviceId)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, serviceId } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response
  if (!(await ensureOwned(result.project.slug, serviceId))) {
    return NextResponse.json({ error: 'Service introuvable.' }, { status: 404 })
  }

  const config = await getProjectServiceConfig(serviceId)
  if ('error' in config) return NextResponse.json({ error: config.error }, { status: 502 })

  // Ne renvoyer que des champs non sensibles (aucune valeur de variable, aucun secret).
  return NextResponse.json({ service: config })
}
