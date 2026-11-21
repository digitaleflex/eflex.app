import { NextResponse } from 'next/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { validateCustomDomain } from '@/lib/custom-domain'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { getSession } from '@/lib/session'
import { listProjectCoolifyServices, updateServiceComponentDomains } from '@/lib/project-coolify-services'
import { requireManagedProject } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  targetUuid: z.string().min(1).max(128),
  /** Domaines/FQDN à appliquer (un par ligne ou séparés par des virgules). Vide pour retirer. */
  domains: z.string().max(2000),
})

async function ensureOwned(projectSlug: string, serviceId: string): Promise<boolean> {
  const listed = await listProjectCoolifyServices(projectSlug)
  if ('error' in listed) return false
  return listed.services.some((s) => s.id === serviceId)
}

function normalizeFqdnInput(input: string): { value: string } | { error: string } {
  const tokens = input
    .split(/[,\n\r\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  if (tokens.length === 0) return { value: '' }

  const hosts: string[] = []
  for (const token of tokens) {
    const res = validateCustomDomain(token)
    if ('error' in res) return { error: res.error }
    hosts.push(res.hostname)
  }
  // Coolify attend généralement une liste séparée par des virgules, avec schéma pour les apps.
  const unique = Array.from(new Set(hosts))
  const value = unique.map((h) => `https://${h}`).join(',')
  return { value }
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

  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })

  const normalized = normalizeFqdnInput(parsed.data.domains)
  if ('error' in normalized) return NextResponse.json({ error: normalized.error }, { status: 400 })

  const updated = await updateServiceComponentDomains(serviceId, parsed.data.targetUuid, normalized.value)
  if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: 502 })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.coolify_service.domains.update',
    target: { type: 'coolify_service', id: serviceId },
    organizationId: org.organizationId,
    details: { projectId: id, targetUuid: parsed.data.targetUuid, domains: normalized.value || '(retiré)' },
    request,
  })

  return NextResponse.json({ ok: true, message: updated.message ?? 'Domaines mis à jour.' })
}
