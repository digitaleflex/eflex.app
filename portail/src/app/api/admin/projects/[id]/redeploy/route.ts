import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { enqueueProjectDeployment } from '@/lib/project-deployments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  reason: z
    .string()
    .trim()
    .max(300, 'Le motif est trop long (300 caractères maximum).')
    .optional(),
})

/**
 * Relance un déploiement depuis la console d'administration (#28).
 * Même verrou que côté client : un seul déploiement actif par projet.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, organizationId: true },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })

  const queued = await enqueueProjectDeployment(project, { exclusive: true })
  if ('error' in queued) {
    const status = queued.code === 'deployment_in_progress' ? 409 : 503
    return NextResponse.json(
      {
        error: queued.error,
        ...(queued.code ? { code: queued.code } : {}),
        ...(queued.activeDeploymentId ? { deploymentId: queued.activeDeploymentId } : {}),
      },
      { status },
    )
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.redeploy',
    target: { type: 'project', id: project.id },
    organizationId: project.organizationId,
    details: { deploymentId: queued.deploymentId, reason: parsed.data.reason ?? null },
    request,
  })

  return NextResponse.json({ deployment: { id: queued.deploymentId, status: 'queued' } }, { status: 202 })
}
