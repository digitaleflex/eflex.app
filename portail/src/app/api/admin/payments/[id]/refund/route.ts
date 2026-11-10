import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { refundPayment } from '@/lib/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({ manual: z.boolean().optional() })

/** Rembourse un paiement (Kkiapay) ou confirme un remboursement manuel (FedaPay). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id } = await params
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    // Corps optionnel.
  }
  const parsed = schema.safeParse(body)
  const manual = parsed.success ? parsed.data.manual === true : false

  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { id: true, organizationId: true, provider: true, amountFcfa: true, plan: true },
  })
  if (!payment) return NextResponse.json({ error: 'Paiement introuvable.' }, { status: 404 })

  const result = await refundPayment(payment.id, manual)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  if ('manual' in result) return NextResponse.json(result, { status: 200 })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'payment.refund',
    target: { type: 'payment', id: payment.id },
    organizationId: payment.organizationId,
    details: { provider: payment.provider, amountFcfa: payment.amountFcfa, plan: payment.plan, manual },
    request,
  })

  return NextResponse.json({ ok: true })
}
