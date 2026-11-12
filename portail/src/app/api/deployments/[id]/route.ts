import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { STATUS_LABELS, isDeploymentStatus } from '@/lib/deployment-state'
import { requireDeploymentById, requireOrg, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Statut et logs d'un déploiement, pour l'interface en temps réel (issue 06). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  // Le filtre relationnel garantit qu'on ne lit que les déploiements de son organisation.
  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Déploiement introuvable')
  const result = await requireDeploymentById(org, id, {
    id: true,
    status: true,
    commitSha: true,
    coolifyBuildId: true,
    logsSummary: true,
    createdAt: true,
  })
  if ('response' in result) return result.response
  const deployment = result.deployment

  const rest = deployment
  return NextResponse.json(
    {
      deployment: {
        ...rest,
        label: isDeploymentStatus(rest.status) ? STATUS_LABELS[rest.status] : rest.status,
        createdAt: rest.createdAt.toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
