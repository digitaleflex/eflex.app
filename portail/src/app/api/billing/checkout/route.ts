import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { allow } from '@/lib/rate-limit'
import { startCheckout, type PaymentProvider } from '@/lib/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  plan: z.string().trim(),
  provider: z.enum(['kkiapay', 'fedapay']),
})

/** Crée le paiement chez le prestataire choisi et renvoie de quoi lancer le checkout. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 404 })
  if (!canManageBilling(org.role)) {
    return NextResponse.json(
      { error: 'Seuls le propriétaire, les administrateurs et le rôle facturation peuvent payer.' },
      { status: 403 },
    )
  }
  if (!(await allow(`checkout:${session.user.id}`, 10, 60_000))) {
    return NextResponse.json({ error: 'Trop de tentatives. Patientez une minute.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Plan ou prestataire invalide.' }, { status: 400 })

  const result = await startCheckout({
    organizationId: org.organizationId,
    userId: session.user.id,
    plan: parsed.data.plan,
    provider: parsed.data.provider as PaymentProvider,
    email: session.user.email,
    name: session.user.name,
  })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
