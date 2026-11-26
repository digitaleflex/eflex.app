import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { listCoolifyDeployments } from '@/lib/coolify-admin'
import { prisma } from '@/lib/prisma'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Déploiements en file ou en cours côté Coolify, rapprochés des projets E-FLEX. Un déploiement sans
 * projet correspondant a été lancé hors d'E-FLEX (interface Coolify, autre outil).
 */
export async function GET() {
  const guard = await requireAdminApi('admin.coolify.read')
  if ('response' in guard) return guard.response
  const deployments = await listCoolifyDeployments()
  if ('error' in deployments) return coolifyError(deployments.error)

  // Rapprochement par l'identifiant de déploiement Coolify enregistré par le worker.
  const ids = deployments.map((item) => item.id)
  const known = ids.length
    ? await prisma.deployment.findMany({
        where: { coolifyBuildId: { in: ids } },
        select: { id: true, coolifyBuildId: true, status: true, project: { select: { id: true, name: true } } },
      })
    : []
  const byId = new Map(known.map((row) => [row.coolifyBuildId, row]))
  return NextResponse.json(
    {
      deployments: deployments.map((item) => {
        const match = byId.get(item.id)
        return {
          ...item,
          project: match?.project ?? null,
          eflexDeploymentId: match?.id ?? null,
          eflexStatus: match?.status ?? null,
        }
      }),
    },
    noStore,
  )
}
