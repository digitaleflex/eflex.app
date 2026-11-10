import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { projectDatabaseAction } from '@/lib/project-databases'

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

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  }

  const { id, databaseId } = await params
  const database = await prisma.projectDatabase.findFirst({
    where: { id: databaseId, projectId: id, project: { organizationId: org.organizationId } },
    select: { id: true, coolifyId: true },
  })
  if (!database) return NextResponse.json({ error: 'Base introuvable.' }, { status: 404 })

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
  return NextResponse.json({ ok: true })
}
