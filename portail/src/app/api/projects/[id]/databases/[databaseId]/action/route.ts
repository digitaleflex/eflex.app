import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { projectDatabaseAction } from '@/lib/project-databases'
import { allowOrg } from '@/lib/rate-limit'
import { requireOrg, requireProjectDatabase, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ action: z.enum(['start', 'stop', 'restart']) })

/** Démarre, arrête ou redémarre une base managée. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  }

  if (!(await allowOrg(org.organizationId, 'database-mutate', 20, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications de bases pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id, databaseId } = await params
  const databaseResult = await requireProjectDatabase(org, id, databaseId, {
    id: true,
    kind: true,
    coolifyId: true,
  })
  if ('response' in databaseResult) return databaseResult.response
  const database = databaseResult.database as { id: string; kind: string; coolifyId: string }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Action invalide.' }, { status: 400 })

  const result = await projectDatabaseAction(database, parsed.data.action)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.database.action',
    target: { type: 'project_database', id: database.id },
    organizationId: org.organizationId,
    details: { projectId: id, kind: database.kind, dbAction: parsed.data.action },
    request,
  })
  return NextResponse.json({ ok: true })
}
