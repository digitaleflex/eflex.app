import { NextResponse } from 'next/server'
import { authMethods } from '@/lib/auth-methods'
import { multiAppEnabled } from '@/lib/multi-app'

export const dynamic = 'force-dynamic'

/**
 * Indique à l'interface quelles méthodes de connexion et fonctions liées aux
 * e-mails sont réellement actives sur cette instance. Les drapeaux viennent de
 * `lib/auth-methods.ts`, la même source que `lib/auth.ts` : sans identifiants OAuth,
 * le provider n'est pas enregistré et l'appel échoue en PROVIDER_NOT_FOUND.
 *
 * `multiApp` expose le drapeau serveur `EFLEX_MULTI_APP` (lot C de D2) :
 * l'interface n'envoie `apps[]` que s'il est actif.
 */
export async function GET() {
  const emailEnabled = Boolean(process.env.RESEND_API_KEY)
  const methods = authMethods()
  return NextResponse.json(
    {
      emailEnabled,
      emailVerificationRequired: emailEnabled,
      googleEnabled: methods.google,
      githubEnabled: methods.github,
      emailCodeEnabled: methods.emailCode,
      multiApp: multiAppEnabled(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
