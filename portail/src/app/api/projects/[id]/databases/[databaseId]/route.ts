import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { deleteProjectDatabase } from '@/lib/project-databases'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { requireOrg, requireProjectDatabase, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Supprime la base managée et la variable d'environnement associée. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; databaseId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de supprimer une base.' }, { status: 403 })
  }

  const mutateLimit = await checkOrg(org.organizationId, 'database-mutate', 20, 60_000)
  if (!mutateLimit.allowed) {
    return rateLimitedResponse(
      mutateLimit,
      'Trop de modifications de bases pour cette organisation en peu de temps. Patientez une minute.',
    )
  }

  const { id, databaseId } = await params
  const databaseResult = await requireProjectDatabase(org, id, databaseId, {
    id: true,
    projectId: true,
    kind: true,
    coolifyId: true,
    internalUrl: true,
    project: {
      select: {
        id: true,
        slug: true,
        name: true,
        organizationId: true,
        coolifyAppId: true,
        apps: { select: { coolifyAppId: true } },
      },
    },
  })
  if ('response' in databaseResult) return databaseResult.response
  const database = databaseResult.database as unknown as {
    id: string
    projectId: string
    kind: string
    coolifyId: string
    internalUrl: string
    project: {
      id: string
      slug: string
      name: string
      organizationId: string
      coolifyAppId: string | null
      apps: Array<{ coolifyAppId: string | null }>
    }
  }

  const result = await deleteProjectDatabase(database.project, database)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.database.delete',
    target: { type: 'project_database', id: database.id },
    organizationId: org.organizationId,
    details: { projectId: id, kind: database.kind, deploymentId: result.deploymentId },
    request,
  })
  return NextResponse.json({
    ok: true,
    deploymentId: result.deploymentId,
    message: 'Base supprimée. La variable correspondante est retirée au prochain déploiement.',
  })
}
