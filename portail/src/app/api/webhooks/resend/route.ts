import { NextRequest, NextResponse } from 'next/server'
import { allowIp } from '@/lib/rate-limit'
import { verifyResendWebhook } from '@/lib/resend-webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ResendEvent {
  type?: string
  data?: { email_id?: string }
}

/**
 * Réception des événements Resend. La signature Svix est vérifiée avant toute
 * interprétation ; aucune donnée personnelle (adresses, corps du message) n'est
 * journalisée.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  if (!(await allowIp(request, 'webhook:resend', 120, 60_000))) {
    return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429 })
  }
  const valid = verifyResendWebhook(
    body,
    {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    process.env.RESEND_WEBHOOK_SECRET || '',
  )

  if (!valid) {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 })
  }

  let event: ResendEvent
  try {
    event = JSON.parse(body) as ResendEvent
  } catch {
    return NextResponse.json({ error: 'Corps invalide.' }, { status: 400 })
  }

  const type = event.type ?? 'inconnu'
  const emailId = event.data?.email_id
  if (type === 'email.bounced' || type === 'email.complained') {
    console.warn(`[eflex/webhook/resend] ${type} email_id=${emailId ?? '-'} : à traiter`)
  } else {
    console.info(`[eflex/webhook/resend] ${type} email_id=${emailId ?? '-'}`)
  }

  return NextResponse.json({ received: true })
}
