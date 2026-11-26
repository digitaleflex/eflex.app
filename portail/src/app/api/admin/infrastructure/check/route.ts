import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { getRateLimitMode } from '@/lib/rate-limit'
import { collectInfrastructure, summarizeInfrastructure } from '@/app/admin/infrastructure/collect'

export const dynamic = 'force-dynamic'

/**
 * Contrôle à la demande : relance toutes les sondes et renvoie un résumé.
 * Une source en panne renvoie un état `danger` avec sa raison, pas une erreur
 * HTTP : le résumé reste exploitable pour l'administrateur.
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi('admin.infrastructure.manage')
  if ('response' in guard) return guard.response

  const snapshot = await collectInfrastructure()
  const rateLimitMode = getRateLimitMode()
  const summary = summarizeInfrastructure(snapshot, rateLimitMode)

  try {
    await audit({
      actor: { id: guard.session.user.id, email: guard.session.user.email },
      action: 'platform.infrastructure.check',
      target: { type: 'platform', id: 'infrastructure' },
      details: { overall: summary.overall, counts: summary.counts, durationMs: summary.durationMs, rateLimitMode },
      request,
    })
  } catch (error) {
    // L'audit ne doit pas empêcher d'afficher un diagnostic d'infrastructure.
    console.error('[eflex/infrastructure] audit du contrôle impossible :', error)
  }

  return NextResponse.json({ summary })
}
