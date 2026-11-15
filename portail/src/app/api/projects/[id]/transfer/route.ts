import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { allow, allowOrg } from '@/lib/rate-limit'
import { firstIssue } from '@/lib/project-settings'
import { transferProject, transferProjectSchema } from '@/lib/project-transfer'
import { requireOrg, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * Transfère le projet vers une autre organisation dont l'utilisateur est propriétaire
 * ou administrateur. Toutes les vérifications de rôle sont refaites dans
 * `lib/project-transfer.ts`, y compris pour l'organisation source.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  if (!(await allow(`project-transfer:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Trop de transferts en peu de temps. Patientez une minute.' }, { status: 429 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!(await allowOrg(org.organizationId, 'project-mutate', 20, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications de projets pour cette organisation. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = transferProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  }

  const result = await transferProject({
    projectId: id,
    sourceOrganizationId: org.organizationId,
    targetOrganizationId: parsed.data.organizationId,
    actor: { id: session.user.id, email: session.user.email },
    request,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({
    project: result.project,
    from: result.from,
    to: result.to,
  })
}
