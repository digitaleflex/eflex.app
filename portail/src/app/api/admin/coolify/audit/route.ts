import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { AUDIT_SOURCES, listCoolifyAudit, type AuditSource } from '@/lib/coolify-admin'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Journal d'audit de Coolify : ce qui a été fait dans Coolify, y compris hors E-FLEX. */
export async function GET(request: Request) {
  const guard = await requireAdminApi('admin.coolify.read')
  if ('response' in guard) return guard.response
  const url = new URL(request.url)
  const rawSource = url.searchParams.get('source') ?? 'all'
  const source = (AUDIT_SOURCES as readonly string[]).includes(rawSource) ? (rawSource as AuditSource) : 'all'
  const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10)
  const result = await listCoolifyAudit({
    page: Number.isFinite(page) ? page : 1,
    search: url.searchParams.get('search')?.trim() || undefined,
    source,
  })
  if ('error' in result) return coolifyError(result.error)
  return NextResponse.json(result, noStore)
}
