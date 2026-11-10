'use client'

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Download, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useEvents } from '@/hooks/events-provider'
import { formatPrice, planById, type Plan } from '@/lib/plans'
import { cn } from '@/lib/utils'

interface BillingSummary {
  plan: Plan
  subscribedPlan: Plan
  status: string
  phase: string
  requestedPlan: string | null
  currentPeriodEnd: string | null
  graceUntil: string | null
  graceDaysLeft: number | null
  priceFcfa: number
  creditFcfa: number
  suspended: boolean
  blocked: boolean
  blockCode: string | null
  message: string | null
  manualOverride: boolean
  usage: { projects: number; members: number }
  limits: { projects: number; members: number; customDomains: number }
  canManage: boolean
  providers: { kkiapay: boolean; fedapay: boolean }
  plans: Plan[]
}

declare global {
  interface Window {
    openKkiapayWidget?: (options: Record<string, unknown>) => void
    addSuccessListener?: (callback: (response: { transactionId?: string }) => void) => void
  }
}

function loadKkiapayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Navigateur indisponible.'))
    if (window.openKkiapayWidget) return resolve()
    const script = document.createElement('script')
    script.src = 'https://cdn.kkiapay.me/k.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Impossible de charger Kkiapay.'))
    document.body.appendChild(script)
  })
}

interface BillingPayment {
  id: string
  plan: string
  planLabel: string
  provider: 'kkiapay' | 'fedapay'
  amountFcfa: number
  status: string
  invoiceNumber: string | null
  refundStatus: string | null
  createdAt: string
}

const PAYMENT_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }> = {
  approved: { label: 'Payé', tone: 'success' },
  pending: { label: 'En attente', tone: 'warning' },
  declined: { label: 'Refusé', tone: 'danger' },
  canceled: { label: 'Annulé', tone: 'muted' },
  expired: { label: 'Expiré', tone: 'muted' },
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

const STATUS_LABEL: Record<string, string> = {
  free: 'Plan gratuit',
  active: 'Actif',
  trialing: 'Période d’essai',
  pending: 'En attente d’activation',
  past_due: 'Paiement en retard',
  expired: 'Période échue',
  cancelled: 'Résilié',
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const utcFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'UTC' })
const formatDate = (value: string) => dateFormat.format(new Date(value))
const utcTitle = (value: string) => `${utcFormat.format(new Date(value))} (UTC)`

function UsageBar({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percent = Math.min(100, Math.round((value / Math.max(1, limit)) * 100))
  const full = value >= limit
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium tabular-nums', full && 'text-warning')}>
          {value} / {limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
        <div
          className={cn('h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** Plan de l'organisation, consommation et demande de changement de plan. */
export function BillingCard() {
  const [data, setData] = useState<BillingSummary | null>(null)
  const [payments, setPayments] = useState<BillingPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      const [response, paymentsResponse] = await Promise.all([
        fetch('/api/billing/summary', { cache: 'no-store' }),
        fetch('/api/billing/payments', { cache: 'no-store' }),
      ])
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Abonnement indisponible.' })
        return
      }
      setData(body as BillingSummary)
      if (paymentsResponse.ok) {
        const paymentsBody = await paymentsResponse.json().catch(() => ({}))
        setPayments(Array.isArray(paymentsBody.payments) ? paymentsBody.payments : [])
      }
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEvents(['subscription.updated'], () => void load())

  async function requestPlan(plan: Plan) {
    setRequesting(plan.id)
    setFeedback(null)
    try {
      const response = await fetch('/api/billing/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Demande impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: body.message ?? 'Demande enregistrée.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setRequesting(null)
    }
  }

  async function pay(plan: Plan, provider: 'kkiapay' | 'fedapay') {
    setPaying(`${plan.id}:${provider}`)
    setFeedback(null)
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, provider }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Paiement indisponible.' })
        return
      }

      if (body.provider === 'credit') {
        setFeedback({ tone: 'success', message: 'Plan activé avec votre crédit de prorata : aucun paiement nécessaire.' })
        await load()
        return
      }

      if (body.provider === 'fedapay' && typeof body.url === 'string') {
        window.location.assign(body.url)
        return
      }

      if (body.provider === 'kkiapay') {
        await loadKkiapayScript()
        if (!window.openKkiapayWidget) throw new Error('Widget Kkiapay indisponible.')
        window.addSuccessListener?.(async (result) => {
          if (!result.transactionId) return
          const confirm = await fetch('/api/billing/kkiapay/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: body.reference, transactionId: result.transactionId }),
          })
          const confirmBody = await confirm.json().catch(() => ({}))
          if (!confirm.ok) {
            setFeedback({ tone: 'error', message: confirmBody.error ?? 'Confirmation du paiement impossible.' })
            return
          }
          setFeedback({ tone: 'success', message: 'Paiement confirmé : votre plan est actif.' })
          await load()
        })
        window.openKkiapayWidget({
          amount: body.amountFcfa,
          key: body.publicKey,
          sandbox: Boolean(body.sandbox),
          partnerId: body.reference,
          data: { reference: body.reference },
          callback: `${window.location.origin}/dashboard/organization?billing=kkiapay`,
        })
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Paiement indisponible.' })
    } finally {
      setPaying(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement de l’abonnement…</p>
  if (!data) return null

  const pending = Boolean(data.requestedPlan) || data.status === 'pending'
  const active = data.phase === 'active' || data.phase === 'trialing'
  const pastDue = data.phase === 'past_due'
  const tone = data.blocked
    ? 'destructive'
    : active
      ? 'success'
      : pastDue || data.phase === 'expired' || data.phase === 'pending'
        ? 'warning'
        : 'outline'

  return (
    <Card id="billing" className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
              Abonnement
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plan effectif de l’organisation, limites et demande de changement.
            </p>
          </div>
          <Badge variant={tone}>
            {STATUS_LABEL[data.phase] ?? data.phase}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {feedback && (
          <p
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={
              feedback.tone === 'error'
                ? 'rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'
                : 'rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground'
            }
          >
            {feedback.message}
          </p>
        )}

        {data.message && (
          <p
            role={data.blocked ? 'alert' : 'status'}
            className={
              data.blocked
                ? 'flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive'
                : 'flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-foreground'
            }
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{data.message}</span>
          </p>
        )}

        {data.graceUntil && data.graceDaysLeft != null && !data.blocked && (
          <p className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-foreground">
            Paiement en retard : les limites du plan restent actives pendant encore{' '}
            <span className="font-semibold tabular-nums">{data.graceDaysLeft} jour{data.graceDaysLeft > 1 ? 's' : ''}</span>{' '}
            (jusqu’au{' '}
            <time dateTime={data.graceUntil} title={utcTitle(data.graceUntil)} className="tabular-nums">
              {formatDate(data.graceUntil)}
            </time>
            ). Régularisez pour éviter le blocage des nouveaux déploiements.
          </p>
        )}

        {data.manualOverride && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Un plan a été appliqué manuellement par l’administration. Il ne sera pas remplacé automatiquement par un
            paiement portant sur un autre plan.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan actuel</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
                {data.plan.label}
                <span className="text-sm font-normal text-muted-foreground">{formatPrice(data.plan.priceFcfa)}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{data.plan.tagline}</p>
            </div>
            {pending && data.requestedPlan && (
              <p className="flex items-start gap-2 text-xs text-warning">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Demande pour le plan {planById(data.requestedPlan).label} en attente d’activation par un administrateur.
              </p>
            )}
            {active && data.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                Renouvellement le{' '}
                <time dateTime={data.currentPeriodEnd} title={utcTitle(data.currentPeriodEnd)} className="tabular-nums">
                  {formatDate(data.currentPeriodEnd)}
                </time>
                .
              </p>
            )}
            {data.phase === 'expired' && data.subscribedPlan.id !== 'free' && (
              <p className="text-xs text-warning">
                La période du plan {data.subscribedPlan.label} est échue : le plan {data.plan.label} s’applique jusqu’au
                renouvellement.
              </p>
            )}
            {data.creditFcfa > 0 && (
              <p className="text-xs text-muted-foreground">
                Crédit de prorata disponible :{' '}
                <span className="font-medium tabular-nums">{new Intl.NumberFormat('fr-FR').format(data.creditFcfa)} FCFA</span>,
                déduit du prochain paiement.
              </p>
            )}
          </div>
          <div className="space-y-3 rounded-lg border border-border p-4">
            <UsageBar label="Projets" value={data.usage.projects} limit={data.limits.projects} />
            <UsageBar label="Membres" value={data.usage.members} limit={data.limits.members} />
            <p className="text-xs text-muted-foreground">
              Domaines personnalisés : {data.limits.customDomains} par projet.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {data.plans.map((plan) => {
            const current = plan.id === data.plan.id
            const requested = pending && plan.id === data.requestedPlan
            return (
              <div
                key={plan.id}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-4',
                  plan.highlighted ? 'border-primary/50 bg-primary/5' : 'border-border',
                )}
              >
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {plan.label}
                    {plan.highlighted && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Recommandé</span>}
                    {current && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Actuel</span>}
                  </p>
                  <p className="mt-1 text-sm font-medium">{formatPrice(plan.priceFcfa)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>{plan.projectLimit} projets</li>
                  <li>{plan.memberLimit} membres</li>
                  <li>{plan.customDomainLimit} domaines par projet</li>
                </ul>
                <div className="mt-auto">
                  {plan.id === 'free' || current ? (
                    <p className="text-xs text-muted-foreground">
                      {current ? 'Votre plan effectif.' : 'Inclus par défaut.'}
                    </p>
                  ) : requested ? (
                    <p className="text-xs font-medium text-warning">Demande en attente</p>
                  ) : !data.canManage ? (
                    <p className="text-xs text-muted-foreground">Réservé aux administrateurs.</p>
                  ) : data.providers.kkiapay || data.providers.fedapay ? (
                    <div className="flex flex-wrap gap-2">
                      {data.providers.kkiapay && (
                        <Button
                          type="button"
                          size="sm"
                          variant={plan.highlighted ? 'primary' : 'outline'}
                          loading={paying === `${plan.id}:kkiapay`}
                          onClick={() => void pay(plan, 'kkiapay')}
                        >
                          Kkiapay
                        </Button>
                      )}
                      {data.providers.fedapay && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          loading={paying === `${plan.id}:fedapay`}
                          onClick={() => void pay(plan, 'fedapay')}
                        >
                          FedaPay
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant={plan.highlighted ? 'primary' : 'outline'}
                      loading={requesting === plan.id}
                      onClick={() => void requestPlan(plan)}
                    >
                      Demander ce plan
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {payments.length > 0 && (
          <section aria-labelledby="payments-title" className="space-y-2">
            <h3 id="payments-title" className="text-sm font-semibold">Paiements récents</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {payments.slice(0, 5).map((payment) => {
                const status = PAYMENT_STATUS[payment.status] ?? { label: payment.status, tone: 'muted' as const }
                const retryable = ['pending', 'declined', 'canceled', 'expired'].includes(payment.status)
                return (
                  <li key={payment.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{payment.planLabel}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Intl.NumberFormat('fr-FR').format(payment.amountFcfa)} FCFA ·{' '}
                        {new Date(payment.createdAt).toLocaleDateString('fr-FR')} · {payment.provider}
                      </span>
                    </span>
                    <span className={cn('inline-flex items-center gap-1.5 text-xs', status.tone === 'success' ? 'text-success' : status.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')}>
                      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', status.tone === 'success' ? 'bg-success' : status.tone === 'danger' ? 'bg-destructive' : 'bg-muted-foreground/50')} />
                      {status.label}
                    </span>
                    {payment.status === 'approved' && (
                      <a
                        href={`/api/billing/invoices/${payment.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Facture
                      </a>
                    )}
                    {retryable && data.canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        loading={paying === `${payment.plan}:${payment.provider}`}
                        onClick={() => void pay(planById(payment.plan), payment.provider)}
                      >
                        Réessayer
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Paiement sécurisé via Kkiapay ou FedaPay. Le plan s’active automatiquement après confirmation du
          prestataire ; si aucun prestataire n’est configuré, un administrateur active le plan manuellement.
        </p>
      </CardContent>
    </Card>
  )
}
