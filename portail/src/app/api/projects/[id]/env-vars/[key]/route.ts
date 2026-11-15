import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { publish } from '@/lib/event-bus'
import { ENV_KEY_MAX, ENV_KEY_PATTERN } from '@/lib/project-settings'
import { assertProjectManager, requireOrg, requireProject, requireProjectApp, tenantNotFound } from '@/lib/tenant'

/**
 * Supprime une variable d'environnement d'un projet.
 * Sans `?appId`, cible la portée projet ; avec `?appId`, cible la portée application.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id, key } = await params

  if (key.length > ENV_KEY_MAX || !ENV_KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Nom de variable invalide.' }, { status: 400 })
  }

  const userLimit = await check(`env:${session.user.id}`, 60, 60_000, { action: 'env-mutate', scope: 'user' })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop de modifications en peu de temps. Patientez une minute.')
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  const denied = assertProjectManager(org)
  if (denied) {
    return NextResponse.json(
      { error: 'Votre rôle dans cette organisation ne permet pas de modifier les variables.' },
      { status: 403 },
    )
  }
  const orgLimit = await checkOrg(org.organizationId, 'env-mutate', 120, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop de modifications de variables pour cette organisation. Patientez une minute.')
  }

  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  const rawAppId = new URL(request.url).searchParams.get('appId')
  const appId = rawAppId && rawAppId.trim() ? rawAppId.trim() : null

  if (appId) {
    const appResult = await requireProjectApp(org, project.id, appId, { id: true })
    if ('response' in appResult) {
      return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
    }
  }

  const result = await prisma.envVar.deleteMany({
    where: appId
      ? { projectId: project.id, key, appId }
      : { projectId: project.id, key, appId: null },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Variable introuvable.' }, { status: 404 })
  }

  await publish({
    type: 'project.updated',
    organizationId: org.organizationId,
    payload: { projectId: project.id },
  })

  return NextResponse.json({ ok: true })
}
