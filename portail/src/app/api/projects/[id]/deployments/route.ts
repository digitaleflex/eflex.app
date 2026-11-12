import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { STATUS_LABELS, isDeploymentStatus } from '@/lib/deployment-state'
import { requireOrg, requireProject, requireProjectApp, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * Historique paginé des déploiements d'un projet (curseur `before` = id du dernier
 * élément reçu). Filtre `status` sur un statut de la machine à états.
 *
 * Lecture réservée aux membres de l'organisation du projet : un membre simple peut
 * consulter l'historique, les écritures restent réservées aux owner/admin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  const url = new URL(request.url)
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT))

  const status = url.searchParams.get('status')
  if (status && !isDeploymentStatus(status)) {
    return NextResponse.json({ error: 'Statut de déploiement inconnu.' }, { status: 400 })
  }

  const before = url.searchParams.get('before')
  const appIdParam = url.searchParams.get('appId')
  if (appIdParam) {
    const appResult = await requireProjectApp(org, project.id, appIdParam, { id: true })
    if ('response' in appResult) {
      return NextResponse.json(
        { error: 'Application introuvable dans ce projet.', code: 'app_not_found' },
        { status: 404 },
      )
    }
  }
  const cursor = before
    ? await prisma.deployment.findFirst({
        where: { id: before, projectId: project.id },
        select: { id: true, createdAt: true },
      })
    : null
  if (before && !cursor) {
    return NextResponse.json({ error: 'Curseur de pagination invalide.' }, { status: 400 })
  }

  const where: Prisma.DeploymentWhereInput = {
    projectId: project.id,
    ...(status ? { status } : {}),
    ...(appIdParam ? { appId: appIdParam } : {}),
    // Tri décroissant sur (createdAt, id) : le curseur reste stable même si plusieurs
    // déploiements partagent la même seconde.
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  }

  const rows = await prisma.deployment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      appId: true,
      app: { select: { name: true } },
      status: true,
      commitSha: true,
      coolifyBuildId: true,
      logsSummary: true,
      createdAt: true,
    },
  })

  const page = rows.slice(0, limit)

  return NextResponse.json(
    {
      deployments: page.map(({ app, ...deployment }) => ({
        ...deployment,
        appName: app?.name ?? null,
        label: isDeploymentStatus(deployment.status) ? STATUS_LABELS[deployment.status] : deployment.status,
        createdAt: deployment.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
