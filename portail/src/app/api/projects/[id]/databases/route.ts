import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { DATABASE_KINDS, createProjectDatabase, isDatabaseKind, refreshProjectDatabase } from '@/lib/project-databases'
import { allowOrg } from '@/lib/rate-limit'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ kind: z.string().trim() })

/** Bases managées du projet (sans URL ni secret). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const { id } = await params
  const projectResult = await requireProject(org, id, {
    id: true,
    databases: { orderBy: { createdAt: 'asc' } },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as unknown as { id: string; databases: Array<any> }

  const databases = await Promise.all(
    project.databases.map(async (database) => {
      let status = database.status ?? 'unknown'
      let error: string | null = null
      const refreshed = await refreshProjectDatabase(database)
      if ('error' in refreshed) error = refreshed.error
      else status = refreshed.status
      const config = DATABASE_KINDS[database.kind as keyof typeof DATABASE_KINDS]
      return {
        id: database.id,
        kind: database.kind,
        label: config?.label ?? database.kind,
        envKey: config?.envKey ?? database.kind.toUpperCase(),
        description: config?.description ?? null,
        status,
        error,
        createdAt: database.createdAt.toISOString(),
      }
    }),
  )

  return NextResponse.json(
    {
      databases,
      canManage: canManageProjects(org.role),
      available: [
        { kind: 'postgresql', ...DATABASE_KINDS.postgresql },
        { kind: 'redis', ...DATABASE_KINDS.redis },
      ].filter((item) => !databases.some((database) => database.kind === item.kind)),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

/** Crée une base managée et injecte DATABASE_URL / REDIS_URL. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de créer une base.' }, { status: 403 })
  }

  if (!(await allowOrg(org.organizationId, 'database-mutate', 20, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications de bases pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, {
    id: true,
    slug: true,
    name: true,
    organizationId: true,
    coolifyAppId: true,
    apps: { select: { coolifyAppId: true } },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as unknown as {
    id: string
    slug: string
    name: string
    organizationId: string
    coolifyAppId: string | null
    apps: Array<{ coolifyAppId: string | null }>
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success || !isDatabaseKind(parsed.data.kind)) {
    return NextResponse.json({ error: 'Type de base invalide.' }, { status: 400 })
  }

  const result = await createProjectDatabase(project, parsed.data.kind)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.database.create',
    target: { type: 'project_database', id: result.database.id },
    organizationId: org.organizationId,
    details: { projectId: project.id, kind: result.database.kind, deploymentId: result.deploymentId },
    request,
  })
  return NextResponse.json(
    {
      database: {
        id: result.database.id,
        kind: result.database.kind,
        status: result.database.status,
      },
      deploymentId: result.deploymentId,
      ready: result.ready,
      message: result.ready
        ? `Base ${DATABASE_KINDS[parsed.data.kind].label} créée. La variable ${DATABASE_KINDS[parsed.data.kind].envKey} est injectée au prochain déploiement.`
        : `Base ${DATABASE_KINDS[parsed.data.kind].label} en cours de démarrage. La variable ${DATABASE_KINDS[parsed.data.kind].envKey} est déjà enregistrée : relancez le déploiement quand la base est en ligne.`,
    },
    { status: 201 },
  )
}
