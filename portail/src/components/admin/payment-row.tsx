'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/** Remplacement admin : téléchargement de facture et remboursement. */
export function AdminPaymentRow({
  paymentId,
  provider,
  status,
  refundStatus,
  invoiceUrl,
}: {
  paymentId: string
  provider: string
  status: string
  refundStatus: string | null
  invoiceUrl: string | null
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [manual, setManual] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const refundable = status === 'approved' && refundStatus !== 'refunded'

  async function refund(withManual = false) {
    setRefunding(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: withManual }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: 'error', text: body.error ?? 'Remboursement impossible.' })
        return
      }
      if (body.manual) {
        setManual(true)
        setMessage({ tone: 'error', text: body.message })
        return
      }
      setMessage({ tone: 'success', text: 'Paiement remboursé. L’abonnement est annulé.' })
      setConfirm(false)
      setManual(false)
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'Impossible de contacter le serveur.' })
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-xs text-destructive' : 'text-xs text-success'}>
          {message.text}
        </p>
      )}
      {invoiceUrl && (
        <a
          href={invoiceUrl}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Facture
        </a>
      )}
      {refundable && (
        <Button type="button" variant="outline" size="sm" loading={refunding} onClick={() => setConfirm(true)}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Rembourser
        </Button>
      )}
      {manual && (
        <Button type="button" variant="destructive" size="sm" loading={refunding} onClick={() => void refund(true)}>
          Confirmer le remboursement manuel
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        title="Rembourser ce paiement ?"
        description={
          provider === 'kkiapay'
            ? 'Le remboursement sera demandé à Kkiapay et l’abonnement sera annulé.'
            : 'FedaPay ne permet pas ce remboursement par API. Effectuez-le dans le tableau de bord FedaPay, puis confirmez ici.'
        }
        confirmLabel={provider === 'kkiapay' ? 'Rembourser' : 'Continuer'}
        destructive
        onConfirm={() => refund(false)}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
