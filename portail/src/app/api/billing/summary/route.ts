import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { billingSummary } from '@/lib/billing'
import { paymentProviders } from '@/lib/payments'
import { PLANS, PLAN_IDS } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/** Plan effectif, consommation et catalogue des plans pour l'organisation active. */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 404 })
  if (!canManageBilling(org.role)) {
    return NextResponse.json(
      { error: 'La facturation est réservée au propriétaire, aux administrateurs et au rôle facturation.' },
      { status: 403 },
    )
  }

  const summary = await billingSummary(org.organizationId)
  return NextResponse.json(
    {
      ...summary,
      canManage: canManageBilling(org.role),
      providers: paymentProviders(),
      plans: PLAN_IDS.map((id) => PLANS[id]),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
