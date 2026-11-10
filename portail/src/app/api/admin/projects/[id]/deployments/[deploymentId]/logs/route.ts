import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { decodeDeploymentLogs, getDeploymentDetails } from '@/lib/coolify'
import { maskProjectLogs } from '@/lib/admin-deployment-logs'
import { parseLogTimes } from '@/lib/admin-projects'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Borne la réponse : un journal de build peut dépasser plusieurs mégaoctets. */
const MAX_RETURN = 20_000

/**
 * Journaux d'un déploiement vus depuis l'administration (issue #28).
 *
 * Lecture **tracée** : chaque appel écrit une entrée d'audit. Les valeurs des
 * variables du projet sont masquées côté serveur ; elles ne sont jamais
 * renvoyées. Repli sur l'extrait enregistré en base si l'hébergement est
 * injoignable.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id, deploymentId } = await params
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    select: {
      id: true,
      projectId: true,
      coolifyBuildId: true,
      logsSummary: true,
      project: {
        select: { id: true, organizationId: true, envVars: { select: { key: true, value: true } } },
      },
    },
  })
  if (!deployment || deployment.projectId !== id) {
    return NextResponse.json({ error: 'Déploiement introuvable pour ce projet.' }, { status: 404 })
  }

  let source: 'coolify' | 'stored' = 'stored'
  let raw: string | null = null
  let warning: string | null = null

  if (deployment.coolifyBuildId) {
    const details = await getDeploymentDetails(deployment.coolifyBuildId)
    if ('error' in details) {
      warning = `Journaux de l’hébergement indisponibles (${details.error}). Extrait enregistré affiché.`
    } else {
      raw = details.logs
      source = 'coolify'
    }
  } else {
    warning = 'Ce déploiement n’a pas encore de build côté hébergement. Extrait enregistré affiché.'
  }

  const text = raw ? decodeDeploymentLogs(raw) : deployment.logsSummary ?? ''
  const masked = maskProjectLogs(deployment.project.id, deployment.project.envVars, text)
  const truncated = masked.length > MAX_RETURN
  const logs = truncated ? masked.slice(-MAX_RETURN) : masked

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'deployment.logs.view',
    target: { type: 'deployment', id: deployment.id },
    organizationId: deployment.project.organizationId,
    details: { projectId: deployment.project.id, source, truncated },
    request,
  })

  return NextResponse.json(
    {
      logs,
      source,
      truncated,
      warning,
      range: raw ? parseLogTimes(raw) : null,
      updatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
