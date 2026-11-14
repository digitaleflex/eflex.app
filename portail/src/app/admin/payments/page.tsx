import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AdminPaymentRow } from '@/components/admin/payment-row'
import { planById } from '@/lib/plans'

export const metadata = { title: 'Paiements — Administration EFLEX' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  approved: 'Payé',
  declined: 'Refusé',
  canceled: 'Annulé',
  expired: 'Expiré',
}

export default async function AdminPaymentsPage() {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      organization: { select: { name: true } },
      user: { select: { email: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paiements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transactions Kkiapay/FedaPay, factures et remboursements.
        </p>
      </div>

      {payments.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-muted-foreground">Aucun paiement.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <Card key={payment.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {planById(payment.plan).label}
                    <Badge variant={payment.status === 'approved' ? 'success' : payment.status === 'pending' ? 'warning' : 'outline'}>
                      {STATUS_LABEL[payment.status] ?? payment.status}
                    </Badge>
                    <span className="text-sm font-normal text-muted-foreground">
                      {new Intl.NumberFormat('fr-FR').format(payment.amountFcfa)} FCFA
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {payment.organization.name} · {payment.user.email} · {payment.provider} ·{' '}
                    <time dateTime={payment.createdAt.toISOString()}>{dateFormat.format(payment.createdAt)}</time>
                  </p>
                  {payment.invoiceNumber && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Facture <span className="font-mono">{payment.invoiceNumber}</span>
                      {payment.refundStatus === 'refunded' && ' · remboursée'}
                      {payment.refundStatus === 'failed' && ' · remboursement en échec'}
                    </p>
                  )}
                </div>
                <AdminPaymentRow
                  paymentId={payment.id}
                  provider={payment.provider}
                  status={payment.status}
                  refundStatus={payment.refundStatus}
                  invoiceUrl={payment.status === 'approved' ? `/api/billing/invoices/${payment.id}` : null}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
