import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { ProjectDatabase } from '@prisma/client'
import { getSession } from '@/lib/session'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import {
  DATABASE_KINDS,
  createProjectDatabase,
  isDatabaseKind,
  listManagedDatabaseCatalog,
  refreshProjectDatabase,
} from '@/lib/project-databases'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { requireManagedProject, requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ kind: z.string().trim() })

/** Bases managées du projet (sans URL ni secret). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const scoped = await requireManagedProject(session, id, {
    id: true,
    databases: { orderBy: { createdAt: 'asc' } },
  })
  if ('response' in scoped) return scoped.response
  const { org, project } = scoped as unknown as {
    org: { organizationId: string; role: string }
    project: { id: string; databases: ProjectDatabase[] }
  }

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

  const catalog = await listManagedDatabaseCatalog()
  const createdKinds = new Set(databases.map((database) => database.kind))
  const engines = catalog.engines.map((engine) => ({
    kind: engine.kind,
    label: engine.label,
    envKey: engine.envKey,
    envAliases: engine.envAliases ?? [],
    description: engine.description,
    backupSupported: engine.backupSupported,
    restoreSupported: engine.restoreSupported,
    provider: engine.provider,
    provisionSupported: engine.provisionSupported,
    lifecycleSupported: engine.lifecycleSupported,
    notes: engine.notes,
    ...(engine.reason ? { reason: engine.reason } : {}),
    created: createdKinds.has(engine.kind),
  }))
  const available = engines.filter((engine) => engine.provisionSupported && !engine.created)

  return NextResponse.json(
    {
      databases,
      canManage: canManageProjects(org.role),
      available,
      engines,
      runtime: {
        version: catalog.runtime.version,
        reachable: catalog.runtime.reachable,
        databaseApiAvailable: catalog.runtime.databaseApiAvailable ?? null,
        checkedAt: catalog.runtime.checkedAt ?? null,
      },
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

  const mutateLimit = await checkOrg(org.organizationId, 'database-mutate', 20, 60_000)
  if (!mutateLimit.allowed) {
    return rateLimitedResponse(
      mutateLimit,
      'Trop de modifications de bases pour cette organisation en peu de temps. Patientez une minute.',
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
  const label = DATABASE_KINDS[parsed.data.kind].label
  const primaryKey = DATABASE_KINDS[parsed.data.kind].envKey
  const aliases = DATABASE_KINDS[parsed.data.kind].envAliases ?? []
  const varsHint = aliases.length > 0 ? `${primaryKey} (+ alias compatibles si disponibles)` : primaryKey

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
        ? result.deploymentId
          ? `Base ${label} créée. Les variables de connexion (${varsHint}) sont injectées et un déploiement a été lancé.`
          : `Base ${label} créée. Les variables de connexion (${varsHint}) seront injectées au prochain déploiement.`
        : `Base ${label} en cours de démarrage. Les variables de connexion (${varsHint}) sont enregistrées : relancez le déploiement quand la base est en ligne.`,
    },
    { status: 201 },
  )
}
