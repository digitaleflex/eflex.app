import { NextRequest, NextResponse } from 'next/server'
import {
  activatePayment,
  findPayment,
  markPaymentFailed,
  verifyFedapaySignature,
} from '@/lib/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface FedapayEvent {
  name?: string
  event?: string
  object?: {
    id?: number | string
    amount?: number
    status?: string
    custom_metadata?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
}

/** Webhook FedaPay : signature `t=…,s=…` (HMAC-SHA256) sur le corps brut. */
export async function POST(request: NextRequest) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook FedaPay non configuré.' }, { status: 503 })

  const raw = await request.text()
  const signature = request.headers.get('x-fedapay-signature')
  if (!verifyFedapaySignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 })
  }

  let event: FedapayEvent
  try {
    event = JSON.parse(raw) as FedapayEvent
  } catch {
    return NextResponse.json({ error: 'Corps invalide.' }, { status: 400 })
  }

  const name = event.name ?? event.event ?? ''
  const object = event.object ?? {}
  const metadata = object.custom_metadata ?? object.metadata ?? {}
  const reference =
    typeof metadata.reference === 'string' ? metadata.reference : undefined
  const providerRef = object.id !== undefined && object.id !== null ? String(object.id) : undefined
  const payment = await findPayment('fedapay', { reference, providerRef })
  if (!payment) return NextResponse.json({ received: true, ignored: true })
  if (payment.status === 'approved') return NextResponse.json({ received: true })

  if (name === 'transaction.declined' || name === 'transaction.canceled') {
    await markPaymentFailed(payment.id, name === 'transaction.declined' ? 'declined' : 'canceled')
    return NextResponse.json({ received: true })
  }
  const approved =
    name === 'transaction.approved' ||
    (name === 'transaction.updated' && object.status?.toLowerCase() === 'approved')
  if (!approved) return NextResponse.json({ received: true, ignored: true })

  const amount = Number(object.amount ?? 0)
  if (!Number.isFinite(amount) || amount < payment.amountFcfa) {
    console.warn('[webhook/fedapay] montant insuffisant', { reference, amount, expected: payment.amountFcfa })
    return NextResponse.json({ received: true, ignored: true })
  }

  const activated = await activatePayment(payment.id, providerRef ?? null)
  if ('error' in activated) {
    return NextResponse.json({ error: activated.error }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}
