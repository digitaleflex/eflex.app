import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Indique à l'interface quelles méthodes de connexion et fonctions liées aux
 * e-mails sont réellement actives sur cette instance. `googleEnabled` doit
 * refléter exactement la condition de `lib/auth.ts` : sans identifiants OAuth,
 * le provider n'est pas enregistré et l'appel échoue en PROVIDER_NOT_FOUND.
 */
export async function GET() {
  const emailEnabled = Boolean(process.env.RESEND_API_KEY)
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )
  return NextResponse.json(
    { emailEnabled, emailVerificationRequired: emailEnabled, googleEnabled },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
