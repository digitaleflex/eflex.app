import { NextRequest, NextResponse } from 'next/server'
import { allowIp } from '@/lib/rate-limit'
import {
  activatePayment,
  findPayment,
  markPaymentFailed,
  verifyKkiapaySecret,
  verifyKkiapayTransaction,
} from '@/lib/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface KkiapayPayload {
  transactionId?: string
  partnerId?: string | null
  amount?: number
  isPaymentSucces?: boolean
  event?: string
}

/** Webhook Kkiapay : le hash secret est comparé en temps constant. */
export async function POST(request: NextRequest) {
  const secret = process.env.KKIAPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook Kkiapay non configuré.' }, { status: 503 })

  const raw = await request.text()
  if (!(await allowIp(request, 'webhook:kkiapay', 120, 60_000))) {
    return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429 })
  }
  const header = request.headers.get('x-kiapay-secret') ?? request.headers.get('x-kkiapay-secret')
  if (!verifyKkiapaySecret(header, secret)) {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 })
  }

  let payload: KkiapayPayload
  try {
    payload = JSON.parse(raw) as KkiapayPayload
  } catch {
    return NextResponse.json({ error: 'Corps invalide.' }, { status: 400 })
  }

  const partnerId = typeof payload.partnerId === 'string' ? payload.partnerId : undefined
  const transactionId = typeof payload.transactionId === 'string' ? payload.transactionId : undefined
  if (!partnerId && !transactionId) return NextResponse.json({ received: true, ignored: true })

  const payment = await findPayment('kkiapay', { reference: partnerId, providerRef: transactionId })
  if (!payment) return NextResponse.json({ received: true, ignored: true })
  if (payment.status === 'approved') return NextResponse.json({ received: true })

  const success = payload.isPaymentSucces === true || payload.event === 'transaction.success'
  if (!success) {
    await markPaymentFailed(payment.id, 'declined')
    return NextResponse.json({ received: true })
  }

  try {
    if (!transactionId) throw new Error('transactionId absent')
    const transaction = await verifyKkiapayTransaction(transactionId)
    if (transaction.status !== 'SUCCESS' || transaction.amount < payment.amountFcfa) {
      await markPaymentFailed(payment.id, 'declined')
      return NextResponse.json({ received: true })
    }
    if (transaction.partnerId && transaction.partnerId !== payment.reference) {
      return NextResponse.json({ received: true, ignored: true })
    }
    await activatePayment(payment.id, transaction.transactionId)
  } catch (error) {
    console.error('[webhook/kkiapay] vérification impossible', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Vérification temporairement indisponible.' }, { status: 502 })
  }

  return NextResponse.json({ received: true })
}
