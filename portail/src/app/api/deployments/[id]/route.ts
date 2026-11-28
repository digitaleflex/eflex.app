import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { STATUS_LABELS, isDeploymentStatus } from '@/lib/deployment-state'
import { neutralizeHostingBrand } from '@/lib/log-lines'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { requireDeploymentById, requireOrg, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Statut et logs d'un déploiement, pour l'interface en temps réel (issue 06). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const readLimit = await check(`deployment-read:${session.user.id}`, 120, 60_000, { action: 'deployment-read', scope: 'user' })
  if (!readLimit.allowed) {
    return rateLimitedResponse(readLimit, 'Trop de consultations de déploiement. Patientez une minute.')
  }

  const { id } = await params
  // Le filtre relationnel garantit qu'on ne lit que les déploiements de son organisation.
  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Déploiement introuvable')

  const orgLimit = await checkOrg(org.organizationId, 'deployment-read', 300, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop de consultations de déploiements pour cette organisation. Patientez une minute.')
  }
  const result = await requireDeploymentById(org, id, {
    id: true,
    status: true,
    commitSha: true,
    logsSummary: true,
    createdAt: true,
  })
  if ('response' in result) return result.response
  const deployment = result.deployment

  const { logsSummary, ...rest } = deployment
  return NextResponse.json(
    {
      deployment: {
        ...rest,
        label: isDeploymentStatus(rest.status) ? STATUS_LABELS[rest.status] : rest.status,
        logsSummary: logsSummary ? neutralizeHostingBrand(logsSummary) : logsSummary,
        createdAt: rest.createdAt.toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
