import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { publish } from '@/lib/event-bus'
import { PERIOD_DAYS, isPlanId, planById, type Plan } from '@/lib/plans'
import { graceDeadline } from '@/lib/billing'

export type PaymentProvider = 'kkiapay' | 'fedapay'

export function kkiapayConfigured(): boolean {
  return Boolean(
    process.env.KKIAPAY_PUBLIC_KEY &&
      process.env.KKIAPAY_PRIVATE_KEY &&
      process.env.KKIAPAY_SECRET_KEY,
  )
}

export function fedapayConfigured(): boolean {
  return Boolean(process.env.FEDAPAY_SECRET_KEY)
}

export function paymentProviders(): { kkiapay: boolean; fedapay: boolean } {
  return { kkiapay: kkiapayConfigured(), fedapay: fedapayConfigured() }
}

const kkiapayBase = () =>
  process.env.KKIAPAY_SANDBOX === 'true'
    ? 'https://api-sandbox.kkiapay.me'
    : 'https://api.kkiapay.me'

const fedapayBase = () =>
  process.env.FEDAPAY_SANDBOX === 'true'
    ? 'https://sandbox-api.fedapay.com/v1'
    : 'https://api.fedapay.com/v1'

const portalUrl = () => (process.env.PORTAL_URL ?? 'https://eflex.app').replace(/\/$/, '')

export async function startCheckout(input: {
  organizationId: string
  userId: string
  plan: string
  provider: PaymentProvider
  email: string
  name: string
}): Promise<
  | { provider: 'kkiapay'; reference: string; amountFcfa: number; publicKey: string; sandbox: boolean; creditFcfa: number }
  | { provider: 'fedapay'; reference: string; url: string; amountFcfa: number; creditFcfa: number }
  | { provider: 'credit'; reference: string; amountFcfa: 0; creditFcfa: number; plan: string }
  | { error: string; status: number }
> {
  if (!isPlanId(input.plan) || input.plan === 'free') {
    return { error: 'Plan payant invalide.', status: 400 }
  }
  const plan = planById(input.plan)
  if (input.provider === 'kkiapay' && !kkiapayConfigured()) {
    return { error: 'Kkiapay n’est pas configuré sur cette plateforme.', status: 503 }
  }
  if (input.provider === 'fedapay' && !fedapayConfigured()) {
    return { error: 'FedaPay n’est pas configuré sur cette plateforme.', status: 503 }
  }

  // Crédit de prorata : il couvre d'abord le prix, jamais de remboursement en numéraire.
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: input.organizationId },
    select: { creditFcfa: true },
  })
  const creditFcfa = Math.min(subscription?.creditFcfa ?? 0, plan.priceFcfa)
  const amountFcfa = plan.priceFcfa - creditFcfa

  const reference = `eflex_${randomUUID().replace(/-/g, '')}`
  const payment = await prisma.payment.create({
    data: {
      reference,
      organizationId: input.organizationId,
      userId: input.userId,
      plan: plan.id,
      provider: amountFcfa === 0 ? 'credit' : input.provider,
      amountFcfa,
      creditFcfa,
      status: 'pending',
    },
  })

  // Le crédit couvre tout le plan : aucun prestataire à solliciter, on active
  // directement (le paiement reste tracé avec provider « credit »).
  if (amountFcfa === 0) {
    const activated = await activatePayment(payment.id, null)
    if ('error' in activated) return { error: activated.error, status: 500 }
    return { provider: 'credit', reference, amountFcfa: 0, creditFcfa, plan: plan.id }
  }

  if (input.provider === 'kkiapay') {
    return {
      provider: 'kkiapay',
      reference,
      amountFcfa,
      creditFcfa,
      publicKey: process.env.KKIAPAY_PUBLIC_KEY as string,
      sandbox: process.env.KKIAPAY_SANDBOX === 'true',
    }
  }

  try {
    const created = await createFedapayTransaction(payment.amountFcfa, reference, plan, {
      email: input.email,
      name: input.name,
    })
    if ('error' in created) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } })
      return { error: created.error, status: 502 }
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: created.id } })
    if (!created.url) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } })
      return { error: 'FedaPay n’a pas renvoyé de lien de paiement.', status: 502 }
    }
    return { provider: 'fedapay', reference, url: created.url, amountFcfa, creditFcfa }
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } }).catch(() => undefined)
    return { error: error instanceof Error ? error.message : 'Paiement indisponible.', status: 502 }
  }
}

async function createFedapayTransaction(
  amountFcfa: number,
  reference: string,
  plan: Plan,
  customer: { email: string; name: string },
): Promise<{ id: string; url: string | null } | { error: string }> {
  const headers = {
    Authorization: `Bearer ${process.env.FEDAPAY_SECRET_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const [firstname, ...rest] = customer.name.trim().split(/\s+/)
  const res = await fetch(`${fedapayBase()}/transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: `EFLEX — ${plan.label}`,
      amount: amountFcfa,
      currency: { iso: 'XOF' },
      callback_url: `${portalUrl()}/dashboard/organization?billing=fedapay`,
      custom_metadata: { reference, plan: plan.id },
      customer: {
        email: customer.email,
        firstname: firstname || customer.email,
        lastname: rest.join(' ') || undefined,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await res.json().catch(() => ({}))) as { id?: number; message?: string }
  if (!res.ok || typeof body.id !== 'number') {
    return { error: body.message ?? `FedaPay a refusé la transaction (HTTP ${res.status}).` }
  }
  const tokenRes = await fetch(`${fedapayBase()}/transactions/${body.id}/token`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { url?: string }
  if (!tokenRes.ok || !tokenBody.url) {
    return { error: `FedaPay n’a pas pu générer le lien de paiement (HTTP ${tokenRes.status}).` }
  }
  return { id: String(body.id), url: tokenBody.url }
}

/** Vérifie une transaction Kkiapay côté serveur (ne jamais faire confiance au client). */
export async function verifyKkiapayTransaction(transactionId: string): Promise<{
  status: string
  amount: number
  partnerId: string | null
  transactionId: string
}> {
  const res = await fetch(`${kkiapayBase()}/api/v1/transactions/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.KKIAPAY_PUBLIC_KEY as string,
      'x-secret-key': process.env.KKIAPAY_SECRET_KEY as string,
      'x-private-key': process.env.KKIAPAY_PRIVATE_KEY as string,
    },
    body: JSON.stringify({ transactionId }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    status?: string
    amount?: number
    partnerId?: string | null
    transactionId?: string
  }
  if (!res.ok) throw new Error(`Kkiapay a refusé la vérification (HTTP ${res.status}).`)
  return {
    status: body.status ?? 'UNKNOWN',
    amount: Number(body.amount ?? 0),
    partnerId: body.partnerId ?? null,
    transactionId: body.transactionId ?? transactionId,
  }
}

/**
 * Active l'abonnement après un paiement confirmé (idempotent).
 *
 * Un changement manuel d'administrateur (`manualOverride`) n'est jamais écrasé
 * silencieusement : si le paiement porte sur un autre plan, le plan manuel est
 * conservé, le plan payé est enregistré dans `pendingPlan`, le montant reçu
 * devient un crédit et l'administrateur est invité à arbitrer. Un paiement pour
 * le plan déjà appliqué lève la période de grâce et redevient le plan courant.
 */
export async function activatePayment(
  paymentId: string,
  providerRef: string | null,
): Promise<{ ok: true } | { error: string }> {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment) return { error: 'Paiement introuvable.' }
    if (payment.status === 'approved') return { ok: true }
    if (!isPlanId(payment.plan)) return { error: 'Plan du paiement invalide.' }
    const plan = planById(payment.plan)

    let appliedPlan: string | null = null
    let conflict = false

    await prisma.$transaction(async (tx) => {
      // Revendication atomique : deux webhooks simultanés ne peuvent pas activer
      // deux fois le même paiement (idempotence).
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'approved', ...(providerRef ? { providerRef } : {}) },
      })
      if (claimed.count === 0) return

      const current = await tx.subscription.findUnique({ where: { organizationId: payment.organizationId } })
      const now = Date.now()
      const base =
        current &&
        ['active', 'trialing', 'past_due'].includes(current.status) &&
        current.currentPeriodEnd &&
        current.currentPeriodEnd.getTime() > now
          ? current.currentPeriodEnd.getTime()
          : now

      conflict = Boolean(current?.manualOverride && current.plan !== plan.id)
      appliedPlan = conflict ? (current?.plan ?? plan.id) : plan.id

      if (conflict && current) {
        // Paiement reçu pour un autre plan : on ne touche pas au plan manuel.
        // Le montant devient un crédit utilisable au prochain paiement.
        await tx.subscription.update({
          where: { organizationId: payment.organizationId },
          data: {
            status: current.status === 'past_due' ? 'active' : current.status,
            graceUntil: null,
            pendingPlan: plan.id,
            creditFcfa: current.creditFcfa + payment.amountFcfa,
            note: `Paiement ${plan.label} reçu alors qu’un plan ${planById(current.plan).label} est appliqué manuellement. Plan payé enregistré en attente.`,
          },
        })
        return
      }

      const nextCredit = Math.max(0, (current?.creditFcfa ?? 0) - payment.creditFcfa)
      await tx.subscription.upsert({
        where: { organizationId: payment.organizationId },
        create: {
          organizationId: payment.organizationId,
          plan: plan.id,
          status: 'active',
          priceFcfa: plan.priceFcfa,
          currentPeriodEnd: new Date(base + PERIOD_DAYS * 86_400_000),
          providerRef,
          creditFcfa: 0,
        },
        update: {
          plan: plan.id,
          status: 'active',
          priceFcfa: plan.priceFcfa,
          currentPeriodEnd: new Date(base + PERIOD_DAYS * 86_400_000),
          pendingPlan: null,
          providerRef,
          graceUntil: null,
          creditFcfa: nextCredit,
          // Le paiement pour le plan manuel confirme le geste commercial :
          // l'override n'a plus besoin de protéger le plan.
          manualOverride: false,
          manualOverrideAt: null,
          manualOverrideBy: null,
          manualOverrideReason: null,
          cancelAtPeriodEnd: false,
        },
      })
    })

    if (appliedPlan) {
      await publish({
        type: 'subscription.updated',
        organizationId: payment.organizationId,
        payload: {
          plan: appliedPlan,
          status: 'active',
          ...(conflict ? { pendingPlan: plan.id, manualOverride: true } : {}),
        },
      })
    }
    return { ok: true }
  } catch (error) {
    console.error('[payments] activation impossible', error)
    return { error: 'Activation du paiement impossible.' }
  }
}

/**
 * Marque un paiement refusé/annulé et, s'il s'agissait d'un renouvellement du
 * plan courant, ouvre la période de grâce (`past_due`). Un échec de premier
 * paiement ou de changement de plan ne dégrade pas un abonnement existant.
 */
export async function markPaymentFailed(paymentId: string, status: 'declined' | 'canceled'): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.status !== 'pending') return

  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'pending' },
    data: { status },
  })
  if (updated.count === 0) return

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: payment.organizationId },
  })
  if (
    !subscription ||
    !['active', 'trialing', 'past_due'].includes(subscription.status) ||
    subscription.plan !== payment.plan
  ) {
    return
  }

  const graceUntil = graceDeadline(subscription.currentPeriodEnd)
  await prisma.subscription.update({
    where: { organizationId: payment.organizationId },
    data: { status: 'past_due', graceUntil },
  })
  await publish({
    type: 'subscription.updated',
    organizationId: payment.organizationId,
    payload: { plan: subscription.plan, status: 'past_due', graceUntil: graceUntil.toISOString() },
  })
}

/**
 * Passe manuellement un abonnement en `past_due` (relance d'impayé, action
 * d'administration). La grâce est calculée depuis l'échéance courante.
 */
export async function markSubscriptionPastDue(organizationId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId } })
  if (!subscription) return
  const graceUntil = graceDeadline(subscription.currentPeriodEnd)
  await prisma.subscription.update({
    where: { organizationId },
    data: { status: 'past_due', graceUntil },
  })
  await publish({
    type: 'subscription.updated',
    organizationId,
    payload: { plan: subscription.plan, status: 'past_due', graceUntil: graceUntil.toISOString() },
  })
}

/** Trouve un paiement par référence interne ou par identifiant prestataire. */
export async function findPayment(provider: PaymentProvider, input: { reference?: string; providerRef?: string }) {
  if (input.reference) {
    return prisma.payment.findFirst({
      where: { reference: input.reference, provider },
    })
  }
  if (input.providerRef) {
    return prisma.payment.findFirst({
      where: { provider, providerRef: input.providerRef },
    })
  }
  return null
}

/** Rembourse une transaction Kkiapay (mobile money). */
export async function refundKkiapayTransaction(transactionId: string): Promise<void> {
  const res = await fetch(`${kkiapayBase()}/api/v1/transactions/revert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.KKIAPAY_PUBLIC_KEY as string,
      'x-secret-key': process.env.KKIAPAY_SECRET_KEY as string,
      'x-private-key': process.env.KKIAPAY_PRIVATE_KEY as string,
    },
    body: JSON.stringify({ transactionId }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string; message?: string }
    throw new Error(body.reason ?? body.message ?? `Kkiapay a refusé le remboursement (HTTP ${res.status}).`)
  }
}

/** Enregistre un remboursement et retire l'accès payant. */
export async function markPaymentRefunded(
  paymentId: string,
  refundRef: string | null,
): Promise<{ ok: true } | { error: string }> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return { error: 'Paiement introuvable.' }
  if (payment.status !== 'approved') return { error: 'Seul un paiement approuvé peut être remboursé.' }
  if (payment.refundStatus === 'refunded') return { ok: true }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        refundStatus: 'refunded',
        refundedAt: new Date(),
        refundRef,
      },
    })
    await tx.subscription.updateMany({
      where: { organizationId: payment.organizationId },
      data: { status: 'cancelled', pendingPlan: null, cancelAtPeriodEnd: false, graceUntil: null, creditFcfa: 0 },
    })
  })

  await publish({
    type: 'subscription.updated',
    organizationId: payment.organizationId,
    payload: { plan: 'free', status: 'cancelled', refunded: true },
  })
  return { ok: true }
}

/** Rembourse via Kkiapay ; FedaPay se fait depuis son tableau de bord (manuel). */
export async function refundPayment(
  paymentId: string,
  manual = false,
): Promise<{ ok: true } | { manual: true; message: string } | { error: string }> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return { error: 'Paiement introuvable.' }
  if (payment.status !== 'approved') return { error: 'Seul un paiement approuvé peut être remboursé.' }
  if (payment.refundStatus === 'refunded') return { ok: true }

  // Paiement réglé uniquement par crédit interne : aucun prestataire à appeler.
  if (payment.provider === 'credit') {
    const result = await markPaymentRefunded(payment.id, null)
    return 'error' in result ? result : { ok: true }
  }

  if (payment.provider === 'fedapay' && !manual) {
    return {
      manual: true,
      message: 'FedaPay ne propose pas d’API de remboursement ici : effectuez-le depuis le tableau de bord FedaPay, puis confirmez le remboursement manuel.',
    }
  }

  try {
    if (payment.provider === 'kkiapay') {
      if (!payment.providerRef) return { error: 'Référence Kkiapay absente.' }
      await refundKkiapayTransaction(payment.providerRef)
    }
    const result = await markPaymentRefunded(payment.id, payment.providerRef)
    return 'error' in result ? result : { ok: true }
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { refundStatus: 'failed' },
    })
    return { error: error instanceof Error ? error.message : 'Remboursement impossible.' }
  }
}

/** Signature FedaPay : en-tête `t=<timestamp>,s=<hmac>` sur `${timestamp}.${body}`. */
export function verifyFedapaySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false
  const parts = new Map<string, string>()
  for (const item of header.split(',')) {
    const [key, ...rest] = item.split('=')
    if (key) parts.set(key.trim(), rest.join('=').trim())
  }
  const timestamp = Number(parts.get('t'))
  const signature = parts.get('s')
  if (!Number.isFinite(timestamp) || !signature) return false
  if (Math.floor(Date.now() / 1000) - timestamp > toleranceSeconds) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const provided = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
}

/** Kkiapay : l'en-tête `x-kiapay-secret` doit correspondre au hash secret du dashboard. */
export function verifyKkiapaySecret(header: string | null, secret: string): boolean {
  if (!header || !secret) return false
  const provided = Buffer.from(header)
  const wanted = Buffer.from(secret)
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
}
