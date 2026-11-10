import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { isAdmin } from '@/lib/admin'
import { generateInvoicePdf } from '@/lib/invoices'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Facture PDF d'un paiement approuvé, limitée à l'organisation propriétaire. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  const admin = isAdmin(session)
  if (!org && !admin) return NextResponse.json({ error: 'Paiement introuvable' }, { status: 404 })
  if (!admin && (!org || !canManageBilling(org.role))) {
    return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 })
  }

  const { paymentId } = await params
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      status: 'approved',
      ...(admin ? {} : { organizationId: org?.organizationId }),
    },
    include: {
      organization: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
  })
  if (!payment) return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 })

  const pdf = await generateInvoicePdf(payment, payment.organization, payment.user)
  const filename = `facture-${payment.invoiceNumber ?? payment.id}.pdf`
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
