import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { requireAdminApi } from '@/lib/admin'
import { normalizeAdminRole } from '@/lib/admin-rbac'
import { notify } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const IMPERSONATION_MAX_MINUTES = 30

const bodySchema = z.object({
  reason: z.string().trim().min(5, 'Indiquez un motif (5 caractères minimum).').max(300, 'Le motif est trop long.'),
  durationMinutes: z.number().int().min(5).max(IMPERSONATION_MAX_MINUTES).optional(),
})

/**
 * Ouvre une session « au nom de » l'utilisateur ciblé. Le cookie de session de
 * l'administrateur est conservé par Better Auth pour pouvoir revenir ensuite.
 * Chaque usurpation est auditée avec l'identité réelle de l'administrateur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi('admin.impersonation.manage')
  if ('response' in guard) return guard.response
  const { session } = guard
  const { id } = await params

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? 'Motif invalide.' }, { status: 400 })
  }

  if (id === session.user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas prendre la main sur votre propre compte.' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, banned: true },
  })
  if (!target) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  if (normalizeAdminRole(target.role)) {
    return NextResponse.json({ error: "L'usurpation d'un compte administrateur est refusée." }, { status: 409 })
  }
  if (target.banned) {
    return NextResponse.json({ error: 'Ce compte est suspendu : réactivez-le avant de prendre la main.' }, { status: 409 })
  }

  const durationMinutes = body.data.durationMinutes ?? IMPERSONATION_MAX_MINUTES
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000)

  try {
    await auth.api.impersonateUser({
      headers: await headers(),
      body: { userId: id },
    })
  } catch {
    return NextResponse.json({ error: "Impossible d'ouvrir la session d'usurpation." }, { status: 500 })
  }

  // Cap la durée de la session d'usurpation (ADM-2).
  await prisma.session.updateMany({
    where: { userId: id, impersonatedBy: session.user.id, expiresAt: { gt: new Date() } },
    data: { expiresAt },
  })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'user.impersonate',
    target: { type: 'user', id: target.id },
    details: {
      targetEmail: target.email,
      targetName: target.name,
      reason: body.data.reason,
      durationMinutes,
      expiresAt: expiresAt.toISOString(),
    },
  })

  // Prévenir les propriétaires des organisations concernées (best-effort).
  const memberships = await prisma.member.findMany({
    where: { userId: id },
    select: { organizationId: true, organization: { select: { members: { where: { role: 'owner' }, select: { userId: true } } } } },
  })
  const ownerIds = new Set<string>()
  for (const m of memberships) for (const owner of m.organization.members) ownerIds.add(owner.userId)
  ownerIds.delete(id)
  const ownerIdList = [...ownerIds]
  if (ownerIdList.length > 0) {
    await notify({
      userIds: ownerIdList,
      type: 'security.impersonation',
      title: 'Accès support à votre compte',
      body: `Un administrateur EFLEX a ouvert une session d’assistance sur le compte ${target.name} (${target.email}) pendant ${durationMinutes} min. Motif : ${body.data.reason}`,
      dedupeKey: `impersonation:${session.user.id}:${id}:${expiresAt.toISOString()}`,
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() })
}
