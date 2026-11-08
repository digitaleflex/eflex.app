import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Indique à l'interface quelles fonctions liées aux e-mails sont actives. */
export async function GET() {
  const emailEnabled = Boolean(process.env.RESEND_API_KEY)
  return NextResponse.json(
    { emailEnabled, emailVerificationRequired: emailEnabled },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
