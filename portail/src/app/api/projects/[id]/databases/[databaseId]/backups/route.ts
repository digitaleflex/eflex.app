import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { ensureDatabaseBackup, getDatabaseBackupStatus, runDatabaseBackupNow } from '@/lib/database-backups'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { requireOrg, requireProjectDatabase, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATABASE_SELECT = { id: true, kind: true, coolifyId: true, backupId: true } as const
type BackupDatabase = { id: string; kind: string; coolifyId: string; backupId: string | null }

/** État des sauvegardes d'une base managée (aucun nom de fichier ni message interne renvoyé). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const { id, databaseId } = await params
  const result = await requireProjectDatabase(org, id, databaseId, DATABASE_SELECT)
  if ('response' in result) return result.response
  const database = result.database as BackupDatabase

  const status = await getDatabaseBackupStatus(database)
  return NextResponse.json(
    { ...status, canManage: canManageProjects(org.role) },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

const schema = z.object({ action: z.enum(['enable', 'run']) })

/** `enable` : planifie les sauvegardes ; `run` : lance une sauvegarde immédiate. */
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

  const limit = await checkOrg(org.organizationId, 'database-backup', 6, 10 * 60_000)
  if (!limit.allowed) {
    return rateLimitedResponse(limit, 'Trop de sauvegardes demandées en peu de temps. Patientez quelques minutes.')
  }

  const { id, databaseId } = await params
  const result = await requireProjectDatabase(org, id, databaseId, DATABASE_SELECT)
  if ('response' in result) return result.response
  const database = result.database as BackupDatabase

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Action invalide.' }, { status: 400 })

  const outcome =
    parsed.data.action === 'run' ? await runDatabaseBackupNow(database) : await ensureDatabaseBackup(database)
  if ('error' in outcome) return NextResponse.json({ error: outcome.error }, { status: 502 })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: parsed.data.action === 'run' ? 'project.database.backup_run' : 'project.database.backup_enable',
    target: { type: 'project_database', id: database.id },
    organizationId: org.organizationId,
    details: { projectId: id, kind: database.kind },
    request,
  })
  return NextResponse.json({
    ok: true,
    message:
      parsed.data.action === 'run'
        ? 'Sauvegarde lancée. Elle apparaîtra dans la liste d’ici une à deux minutes.'
        : 'Sauvegardes planifiées.',
  })
}
