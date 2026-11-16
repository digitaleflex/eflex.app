import { CircleAlert, CreditCard, ReceiptText, Wallet } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { AdminPaymentRow } from '@/components/admin/payment-row'
import { formatFcfa, planById } from '@/lib/plans'
import { formatInteger } from '@/lib/table'

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

function statusTone(status: string): StatusTone {
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'declined') return 'destructive'
  return 'neutral'
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

  const pendingPayments = payments.filter((payment) => payment.status === 'pending')
  const approvedPayments = payments.filter((payment) => payment.status === 'approved')
  const pendingAmount = pendingPayments.reduce((sum, payment) => sum + payment.amountFcfa, 0)
  const approvedAmount = approvedPayments.reduce((sum, payment) => sum + payment.amountFcfa, 0)
  const refundedCount = payments.filter((payment) => payment.refundStatus === 'refunded').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements"
        description="Transactions Kkiapay/FedaPay, factures et remboursements. Liste des 50 paiements les plus récents."
      />

      <section aria-label="Indicateurs des paiements" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Paiements affichés"
          value={formatInteger(payments.length)}
          hint="50 plus récents"
          icon={CreditCard}
        />
        <StatCard
          label="En attente"
          value={formatInteger(pendingPayments.length)}
          hint={formatFcfa(pendingAmount)}
          icon={CircleAlert}
          tone={pendingPayments.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Payés"
          value={formatInteger(approvedPayments.length)}
          hint={formatFcfa(approvedAmount)}
          icon={Wallet}
          tone="positive"
        />
        <StatCard
          label="Remboursés"
          value={formatInteger(refundedCount)}
          hint="Paiements marqués remboursés"
          icon={ReceiptText}
          tone="neutral"
        />
      </section>

      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={CreditCard}
            title="Aucun paiement"
            description="Aucune transaction enregistrée pour le moment."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <Card key={payment.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    <span>{planById(payment.plan).label}</span>
                    <StatusBadge
                      status={payment.status}
                      label={STATUS_LABEL[payment.status] ?? payment.status}
                      tone={statusTone(payment.status)}
                    />
                    {payment.refundStatus === 'refunded' && (
                      <StatusBadge status="refunded" label="Remboursée" tone="neutral" />
                    )}
                    {payment.refundStatus === 'failed' && (
                      <StatusBadge status="refund_failed" label="Remboursement en échec" tone="destructive" />
                    )}
                    <span className="text-sm font-normal text-muted-foreground tabular-nums">
                      {new Intl.NumberFormat('fr-FR').format(payment.amountFcfa)} FCFA
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {payment.organization.name} · {payment.user.email} · {payment.provider} ·{' '}
                    <time dateTime={payment.createdAt.toISOString()}>{dateFormat.format(payment.createdAt)}</time>
                  </p>
                  {payment.invoiceNumber && (
                    <p className="text-xs text-muted-foreground">
                      Facture <span className="font-mono">{payment.invoiceNumber}</span>
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
