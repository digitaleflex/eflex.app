import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/admin'
import { auditWhere, parseAuditQuery } from '@/lib/admin-audit'
import { redact } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

/**
 * Tail du journal d'audit pour `/admin/audit` : les plus récentes entrées, sans rechargement.
 * Le journal est déjà assaini à l'écriture ; on repasse `redact` par précaution et on n'expose
 * ni adresse IP ni agent utilisateur (inutiles à la surveillance en direct). Les mêmes filtres
 * que la page (action, acteur, cible, période) sont appliqués côté serveur.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  const params = new URL(request.url).searchParams
  const requested = Number.parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT
  const query = parseAuditQuery({
    action: params.get('action') ?? undefined,
    acteur: params.get('acteur') ?? undefined,
    cible: params.get('cible') ?? undefined,
    jours: params.get('jours') ?? undefined,
  })

  const rows = await prisma.auditLog.findMany({
    where: auditWhere(query),
    orderBy: { createdAt: 'desc' },
    take: limit,
    // Ni adresse IP ni agent utilisateur : inutiles à la surveillance en direct.
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      organizationId: true,
      actorEmail: true,
      details: true,
      createdAt: true,
    },
  })
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
