import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { deleteApplication } from '@/lib/coolify'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { REASON_MAX, REASON_MIN } from '@/lib/admin-projects'
import { collectCoolifyAppIds } from '@/lib/project-primary'

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
 * Supprime les applications **côté infrastructure** (Coolify) sans supprimer le
 * projet ni son historique. Les références locales sont remises à zéro après
 * succès : un échec local est signalé et reste détectable par la réconciliation.
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
    select: {
      id: true,
      name: true,
      organizationId: true,
      coolifyAppId: true,
      apps: { select: { id: true, coolifyAppId: true } },
    },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })

  const appIds = project.apps.length > 0 ? collectCoolifyAppIds({ apps: project.apps }) : project.coolifyAppId ? [project.coolifyAppId] : []
  if (appIds.length === 0) {
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
        error: 'Un déploiement est en cours pour ce projet : annulez-le ou débloquez-le avant de supprimer les applications.',
        deploymentId: active.id,
      },
      { status: 409 },
    )
  }

  const results = await Promise.all(appIds.map((appId: string) => deleteApplication(appId)))
  const failure = results.find((result: { error?: string } | unknown): result is { error: string } => Boolean(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)))
  if (failure) {
    return NextResponse.json(
      { error: `L’infrastructure n’a pas confirmé la suppression : ${failure.error}` },
      { status: 502 },
    )
  }

  let localCleared = true
  try {
    await prisma.$transaction([
      prisma.project.update({
        where: { id: project.id },
        data: { coolifyAppId: null, tlsValid: null, tlsExpiresAt: null, tlsCheckedAt: null },
      }),
      prisma.projectApp.updateMany({
        where: { projectId: project.id },
        data: { coolifyAppId: null, tlsValid: null, tlsExpiresAt: null, tlsCheckedAt: null },
      }),
    ])
  } catch {
    localCleared = false
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.infrastructure.delete',
    target: { type: 'project', id: project.id },
    organizationId: project.organizationId,
    details: { coolifyAppIds: appIds, reason: parsed.data.reason, localCleared },
    request,
  })

  if (!localCleared) {
    return NextResponse.json(
      {
        error:
          'Les applications ont été supprimées, mais les références locales n’ont pas pu être effacées. La réconciliation les signalera : effacez-les manuellement si nécessaire.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
