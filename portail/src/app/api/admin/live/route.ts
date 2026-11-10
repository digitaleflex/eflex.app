import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/admin'
import { organizationNames, toWireEvent } from '@/lib/live-events-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

const cursor = (value: string | null): number | null => {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

/**
 * Lecture globale des événements de la plateforme (terminal d'exploitation).
 * Réservée aux administrateurs : toute autre session reçoit 404, comme les autres routes admin.
 *
 * Curseurs : `after` (strictement postérieurs, pour le rattrapage) ou `before` (strictement
 * antérieurs, pour remonter l'historique). Les événements reviennent toujours par identifiant
 * croissant. Les charges utiles sont assainies : aucun secret, aucun corps de requête.
 */
export async function GET(request: Request) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  const url = new URL(request.url)
  const after = cursor(url.searchParams.get('after'))
  const before = cursor(url.searchParams.get('before'))
  const requested = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : DEFAULT_LIMIT

  const rows = after !== null
    ? await prisma.event.findMany({ where: { id: { gt: BigInt(after) } }, orderBy: { id: 'asc' }, take: limit })
    : await prisma.event.findMany({
        where: before !== null ? { id: { lt: BigInt(before) } } : {},
        orderBy: { id: 'desc' },
        take: limit,
      })

  // `after` : déjà croissant. `before` et l'état initial : lus à l'envers, remis à l'endroit.
  const ordered = after !== null ? rows : rows.reverse()
  const organizations = await organizationNames(ordered.map((row) => row.organizationId))
  const events = ordered.map((row) => toWireEvent(row, row.organizationId ? organizations[row.organizationId] ?? null : null))

  return NextResponse.json(
    {
      events,
      organizations,
      cursors: {
        oldest: events[0]?.id ?? null,
        newest: events[events.length - 1]?.id ?? null,
      },
      hasMore: rows.length === limit,
      serverTime: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
