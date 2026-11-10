import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/admin'
import { redact } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

/**
 * Tail du journal d'audit pour `/admin/audit` : les plus récentes entrées, sans rechargement.
 * Le journal est déjà assaini à l'écriture ; on repasse `redact` par précaution et on n'expose
 * ni adresse IP ni agent utilisateur (inutiles à la surveillance en direct).
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  const requested = Number.parseInt(new URL(request.url).searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT

  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
  const entries = rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    organizationId: row.organizationId,
    actorEmail: row.actorEmail,
    details: (redact(row.details) ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }))

  return NextResponse.json({ entries, serverTime: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } })
}
