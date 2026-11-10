import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { publish } from '@/lib/event-bus'
import { SUSPENDED_MESSAGE } from '@/lib/billing'

export const dynamic = 'force-dynamic'

const schema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(3, 'Indiquez un motif (3 caractères minimum).').max(500, 'Motif trop long (500 caractères).'),
})

/**
 * Suspend ou réactive une organisation (#27). La suspension ne supprime
 * **rien** : elle gèle la création de projets et les nouveaux déploiements,
 * les applications en ligne et les données restent intactes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id } = await params
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, suspendedAt: true },
  })
  if (!organization) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
      { status: 400 },
    )
  }

  const { suspended, reason } = parsed.data
  const updated = await prisma.organization.update({
    where: { id: organization.id },
    data: {
      suspendedAt: suspended ? new Date() : null,
      suspensionReason: suspended ? reason : null,
    },
    select: { id: true, suspendedAt: true, suspensionReason: true },
  })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: suspended ? 'organization.suspend' : 'organization.reactivate',
    target: { type: 'organization', id: organization.id },
    organizationId: organization.id,
    details: { reason, previous: organization.suspendedAt?.toISOString() ?? null },
    request,
  })
  await publish({
    type: 'organization.suspension',
    organizationId: organization.id,
    payload: { suspended, reason },
  })

  return NextResponse.json({
    organization: updated,
    message: suspended ? SUSPENDED_MESSAGE : 'Organisation réactivée : les créations et déploiements sont de nouveau autorisés.',
  })
}
