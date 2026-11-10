import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { publish } from '@/lib/event-bus'
import { PLANS, isPlanId } from '@/lib/plans'

export const dynamic = 'force-dynamic'

const schema = z.object({ plan: z.string().trim() })

/**
 * Demande de passage à un plan payant. L'abonnement reste `pending` : les limites
 * payantes ne s'appliquent qu'après activation par un administrateur (paiement).
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 404 })
  if (!canManageBilling(org.role)) {
    return NextResponse.json(
      { error: 'Seuls le propriétaire, les administrateurs et le rôle facturation peuvent changer de plan.' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success || !isPlanId(parsed.data.plan) || parsed.data.plan === 'free') {
    return NextResponse.json({ error: 'Plan invalide.' }, { status: 400 })
  }

  const plan = PLANS[parsed.data.plan]
  const subscription = await prisma.subscription.upsert({
    where: { organizationId: org.organizationId },
    create: {
      organizationId: org.organizationId,
      plan: 'free',
      status: 'active',
      priceFcfa: 0,
      pendingPlan: plan.id,
    },
    update: { pendingPlan: plan.id },
    select: { plan: true, status: true, pendingPlan: true },
  })

  await publish({
    type: 'subscription.updated',
    organizationId: org.organizationId,
    payload: { plan: subscription.plan, status: subscription.status, pendingPlan: subscription.pendingPlan },
  })

  return NextResponse.json({
    subscription,
    message: `Demande pour le plan ${plan.label} enregistrée. Un administrateur l’activera après réception du paiement.`,
  })
}
