import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { allow } from '@/lib/rate-limit'
import { findPayment, kkiapayConfigured, verifyKkiapayTransaction, activatePayment } from '@/lib/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  reference: z.string().trim().min(10).max(100),
  transactionId: z.string().trim().min(1).max(200),
})

/** Vérifie côté serveur le paiement Kkiapay renvoyé par le widget, puis active le plan. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!kkiapayConfigured()) return NextResponse.json({ error: 'Kkiapay non configuré.' }, { status: 503 })
  if (!(await allow(`kkiapay-confirm:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Trop de tentatives. Patientez une minute.' }, { status: 429 })
  }

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 404 })
  if (!canManageBilling(org.role)) {
    return NextResponse.json({ error: 'Accès à la facturation non autorisé.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Paiement invalide.' }, { status: 400 })

  const payment = await findPayment('kkiapay', { reference: parsed.data.reference })
  if (!payment || payment.organizationId !== org.organizationId) {
    return NextResponse.json({ error: 'Paiement introuvable.' }, { status: 404 })
  }
  if (payment.status === 'approved') return NextResponse.json({ ok: true })

  try {
    const transaction = await verifyKkiapayTransaction(parsed.data.transactionId)
    if (transaction.status !== 'SUCCESS') {
      return NextResponse.json({ error: 'Le paiement n’a pas abouti.' }, { status: 422 })
    }
    if (transaction.amount < payment.amountFcfa) {
      return NextResponse.json({ error: 'Le montant payé est inférieur au plan choisi.' }, { status: 422 })
    }
    if (transaction.partnerId && transaction.partnerId !== payment.reference) {
      return NextResponse.json({ error: 'La transaction ne correspond pas à cette demande.' }, { status: 422 })
    }

    const activated = await activatePayment(payment.id, transaction.transactionId)
    if ('error' in activated) return NextResponse.json({ error: activated.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[kkiapay] vérification impossible', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Vérification du paiement impossible.' }, { status: 502 })
  }
}
