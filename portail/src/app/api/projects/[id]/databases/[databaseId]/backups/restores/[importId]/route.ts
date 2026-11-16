import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canManageProjects } from '@/lib/organizations'
import { getDatabaseRestoreStatus } from '@/lib/database-backups'
import { requireOrg, requireProjectDatabase, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Suivi d'une restauration. La base est d'abord vérifiée dans l'organisation ; Coolify vérifie ensuite que
 * l'opération concerne bien cette base (sinon 404). La sortie brute de la commande n'est jamais renvoyée.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; databaseId: string; importId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  }

  const { id, databaseId, importId } = await params
  if (!/^\d{1,20}$/.test(importId)) return tenantNotFound('Restauration introuvable.')
  const result = await requireProjectDatabase(org, id, databaseId, { coolifyId: true })
  if ('response' in result) return result.response

  const status = await getDatabaseRestoreStatus(result.database as { coolifyId: string }, importId)
  if ('error' in status) {
    const notFound = status.error.includes('404')
    return NextResponse.json(
      { error: notFound ? 'Restauration introuvable.' : status.error },
      { status: notFound ? 404 : 502 },
    )
  }
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
