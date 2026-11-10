import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { deleteProjectDatabase } from '@/lib/project-databases'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Supprime la base managée et la variable d'environnement associée. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; databaseId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de supprimer une base.' }, { status: 403 })
  }

  const { id, databaseId } = await params
  const database = await prisma.projectDatabase.findFirst({
    where: { id: databaseId, projectId: id, project: { organizationId: org.organizationId } },
    select: {
      id: true,
      kind: true,
      coolifyId: true,
      project: { select: { id: true, slug: true, name: true, organizationId: true, coolifyAppId: true } },
    },
  })
  if (!database) return NextResponse.json({ error: 'Base introuvable.' }, { status: 404 })

  const result = await deleteProjectDatabase(database.project, database)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    deploymentId: result.deploymentId,
    message: 'Base supprimée. La variable correspondante est retirée au prochain déploiement.',
  })
}
