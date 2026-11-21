import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { getSession } from '@/lib/session'
import { listProjectCoolifyServices, serviceEnvSetSchema, setServiceEnvVars } from '@/lib/project-coolify-services'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function ensureOwned(projectSlug: string, serviceId: string): Promise<boolean> {
  const listed = await listProjectCoolifyServices(projectSlug)
  if ('error' in listed) return false
  return listed.services.some((s) => s.id === serviceId)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, serviceId } = await params
  const result = await requireManagedProject(session, id, { id: true, slug: true })
  if ('response' in result) return result.response

  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de modifier la configuration des services.' }, { status: 403 })
  }

  const mutateLimit = await checkOrg(org.organizationId, 'service-config-mutate', 30, 60_000)
  if (!mutateLimit.allowed) {
    return rateLimitedResponse(
      mutateLimit,
      'Trop de modifications de configuration de services en peu de temps. Patientez une minute.',
    )
  }

  if (!(await ensureOwned(result.project.slug, serviceId))) {
    return NextResponse.json({ error: 'Service introuvable.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }

  const parsed = serviceEnvSetSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Données invalides.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const updated = await setServiceEnvVars(serviceId, parsed.data.variables)
  if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: 502 })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.coolify_service.envs.update',
    target: { type: 'coolify_service', id: serviceId },
    organizationId: org.organizationId,
    // Les valeurs sont redigées par l’audit (clé "value" masquée) ; on journalise uniquement les noms.
    details: { projectId: id, keys: parsed.data.variables.map((v) => v.key), count: parsed.data.variables.length, restarted: updated.restarted },
    request,
  })

  return NextResponse.json({
    ok: true,
    restarted: updated.restarted,
    message: updated.message ?? 'Variables enregistrées. Le service a été redémarré pour appliquer les changements.',
  })
}
