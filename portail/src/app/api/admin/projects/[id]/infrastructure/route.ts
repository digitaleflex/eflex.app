import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { deleteApplication } from '@/lib/coolify'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { REASON_MAX, REASON_MIN } from '@/lib/admin-projects'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  /** Le nom exact du projet doit être saisi : garde-fou contre un clic malheureux. */
  confirmName: z.string().trim().min(1, 'Saisissez le nom du projet pour confirmer.'),
  reason: z
    .string()
    .trim()
    .min(REASON_MIN, `Indiquez un motif (${REASON_MIN} caractères minimum).`)
    .max(REASON_MAX, 'Le motif est trop long (300 caractères maximum).'),
})

/**
 * Supprime l'application **côté infrastructure** (Coolify) sans supprimer le
 * projet ni son historique. La référence locale est remise à zéro après succès :
 * un échec local est signalé et reste détectable par la réconciliation.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, organizationId: true, coolifyAppId: true },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  if (!project.coolifyAppId) {
    return NextResponse.json(
      { error: 'Ce projet n’a pas d’application sur l’infrastructure : rien à supprimer.' },
      { status: 409 },
    )
  }
  if (parsed.data.confirmName !== project.name) {
    return NextResponse.json(
      { error: 'Le nom saisi ne correspond pas au nom du projet : suppression annulée.' },
      { status: 400 },
    )
  }

  const active = await prisma.deployment.findFirst({
    where: { projectId: project.id, status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
    select: { id: true },
  })
  if (active) {
    return NextResponse.json(
      {
        error: 'Un déploiement est en cours pour ce projet : annulez-le ou débloquez-le avant de supprimer l’application.',
        deploymentId: active.id,
      },
      { status: 409 },
    )
  }

  const removed = await deleteApplication(project.coolifyAppId)
  if ('error' in removed) {
    return NextResponse.json(
      { error: `L’infrastructure n’a pas confirmé la suppression : ${removed.error}` },
      { status: 502 },
    )
  }

  let localCleared = true
  try {
    await prisma.project.update({
      where: { id: project.id },
      data: { coolifyAppId: null, tlsValid: null, tlsExpiresAt: null, tlsCheckedAt: null },
    })
  } catch {
    localCleared = false
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.infrastructure.delete',
    target: { type: 'project', id: project.id },
    organizationId: project.organizationId,
    details: { coolifyAppId: project.coolifyAppId, reason: parsed.data.reason, localCleared },
    request,
  })

  if (!localCleared) {
    return NextResponse.json(
      {
        error:
          'L’application a été supprimée, mais la référence locale n’a pas pu être effacée. La réconciliation la signalera : effacez-la manuellement si nécessaire.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
