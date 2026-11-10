import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { planById } from '@/lib/plans'

export const dynamic = 'force-dynamic'

const EXPIRE_AFTER_MS = 24 * 3600 * 1000

/** Historique des paiements de l'organisation + expiration des tentatives abandonnées. */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 404 })
  if (!canManageBilling(org.role)) {
    return NextResponse.json({ error: 'Accès à la facturation non autorisé.' }, { status: 403 })
  }

  await prisma.payment.updateMany({
    where: {
      organizationId: org.organizationId,
      status: 'pending',
      createdAt: { lt: new Date(Date.now() - EXPIRE_AFTER_MS) },
    },
    data: { status: 'expired' },
  })

  const payments = await prisma.payment.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      plan: true,
      provider: true,
      amountFcfa: true,
      status: true,
      invoiceNumber: true,
      refundStatus: true,
      createdAt: true,
    },
  })

  return NextResponse.json(
    {
      payments: payments.map((payment) => ({
        ...payment,
        planLabel: planById(payment.plan).label,
        createdAt: payment.createdAt.toISOString(),
      })),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
