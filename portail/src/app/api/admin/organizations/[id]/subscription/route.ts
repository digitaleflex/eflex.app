import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { publish } from '@/lib/event-bus'
import { PLANS, isPlanId, planById } from '@/lib/plans'
import { graceDeadline, nextPeriodEnd, prorationCreditFcfa } from '@/lib/billing'

export const dynamic = 'force-dynamic'

const STATUSES = ['active', 'trialing', 'pending', 'past_due', 'cancelled'] as const
const DAY_MS = 86_400_000

const reason = z.string().trim().min(3, 'Indiquez un motif (3 caractères minimum).').max(500, 'Motif trop long (500 caractères).')

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plan'),
    plan: z.string().trim(),
    status: z.enum(STATUSES).default('active'),
    currentPeriodEnd: z.string().datetime().nullable().optional(),
    reason,
  }),
  z.object({
    action: z.literal('extend'),
    days: z.number().int().min(1).max(365),
    reason,
  }),
  z.object({
    action: z.literal('quota'),
    projectLimit: z.number().int().min(0).max(1_000).nullable().optional(),
    memberLimit: z.number().int().min(0).max(1_000).nullable().optional(),
    until: z.string().datetime().nullable().optional(),
    reason,
  }),
  z.object({ action: z.literal('clear-override'), reason }),
])

/**
 * Actions d'administration sur l'abonnement d'une organisation (#18/#27).
 * Chaque action exige un motif et écrit une entrée d'audit.
 *
 * Règle de prorata : un changement de plan en cours de période crédite la
 * valeur non consommée de l'ancien plan (jours restants / 30), sans
 * remboursement en numéraire ; le crédit est déduit du prochain paiement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id } = await params
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true },
  })
  if (!organization) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
      { status: 400 },
    )
  }
  const input = parsed.data
  const current = await prisma.subscription.findUnique({ where: { organizationId: organization.id } })
  const now = new Date()

  // ── Changement de plan / statut ────────────────────────────────────────────
  if (input.action === 'plan') {
    if (!isPlanId(input.plan)) {
      return NextResponse.json({ error: 'Plan invalide.' }, { status: 400 })
    }
    const plan = PLANS[input.plan]
    const active = input.status === 'active' || input.status === 'trialing'
    const currentPlan = planById(current?.plan)
    const planChanged = current != null && current.plan !== plan.id
    const credit = planChanged ? prorationCreditFcfa(currentPlan, current?.currentPeriodEnd ?? null, now) : 0
    const keepEnd =
      current?.currentPeriodEnd && current.currentPeriodEnd.getTime() > now.getTime()
        ? current.currentPeriodEnd
        : null
    const periodEnd = input.currentPeriodEnd
      ? new Date(input.currentPeriodEnd)
      : plan.priceFcfa === 0
        ? null
        : active
          ? keepEnd ?? nextPeriodEnd(current?.currentPeriodEnd ?? null, now)
          : keepEnd
    const graceUntil =
      input.status === 'past_due'
        ? current?.graceUntil && current.graceUntil.getTime() > now.getTime()
          ? current.graceUntil
          : graceDeadline(current?.currentPeriodEnd ?? null, now)
        : null

    const subscription = await prisma.subscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        plan: plan.id,
        status: input.status,
        priceFcfa: plan.priceFcfa,
        currentPeriodEnd: periodEnd,
        pendingPlan: null,
        graceUntil,
        creditFcfa: credit,
        manualOverride: true,
        manualOverrideAt: now,
        manualOverrideBy: session.user.email,
        manualOverrideReason: input.reason,
        note: input.reason,
      },
      update: {
        plan: plan.id,
        status: input.status,
        priceFcfa: plan.priceFcfa,
        currentPeriodEnd: periodEnd,
        pendingPlan: null,
        graceUntil,
        creditFcfa: (current?.creditFcfa ?? 0) + credit,
        manualOverride: true,
        manualOverrideAt: now,
        manualOverrideBy: session.user.email,
        manualOverrideReason: input.reason,
        note: input.reason,
      },
      select: { plan: true, status: true, priceFcfa: true, currentPeriodEnd: true, creditFcfa: true },
    })

    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: 'organization.plan.change',
      target: { type: 'organization', id: organization.id },
      organizationId: organization.id,
      details: {
        from: current?.plan ?? null,
        to: plan.id,
        fromStatus: current?.status ?? null,
        toStatus: input.status,
        reason: input.reason,
        creditFcfa: credit,
        periodEnd: periodEnd?.toISOString() ?? null,
      },
      request,
    })
    await publish({
      type: 'subscription.updated',
      organizationId: organization.id,
      payload: { plan: plan.id, status: input.status, manualOverride: true },
    })
    return NextResponse.json({ subscription })
  }

  // ── Prolongation de période / essai ────────────────────────────────────────
  if (input.action === 'extend') {
    const base =
      current?.currentPeriodEnd && current.currentPeriodEnd.getTime() > now.getTime()
        ? current.currentPeriodEnd
        : now
    const periodEnd = new Date(base.getTime() + input.days * DAY_MS)
    const status = current?.status === 'trialing' ? 'trialing' : 'active'
    const subscription = await prisma.subscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        plan: current?.plan ?? 'free',
        status,
        priceFcfa: current?.priceFcfa ?? 0,
        currentPeriodEnd: periodEnd,
        note: input.reason,
      },
      update: {
        status,
        currentPeriodEnd: periodEnd,
        graceUntil: null,
        note: input.reason,
      },
      select: { plan: true, status: true, currentPeriodEnd: true },
    })

    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: 'organization.period.extend',
      target: { type: 'organization', id: organization.id },
      organizationId: organization.id,
      details: { days: input.days, periodEnd: periodEnd.toISOString(), reason: input.reason },
      request,
    })
    await publish({
      type: 'subscription.updated',
      organizationId: organization.id,
      payload: { plan: subscription.plan, status: subscription.status },
    })
    return NextResponse.json({ subscription })
  }

  // ── Relevé temporaire de quota ─────────────────────────────────────────────
  if (input.action === 'quota') {
    if (input.projectLimit == null && input.memberLimit == null) {
      return NextResponse.json({ error: 'Indiquez au moins un quota à relever.' }, { status: 400 })
    }
    const until = input.until ? new Date(input.until) : new Date(now.getTime() + 30 * DAY_MS)
    const subscription = await prisma.subscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        plan: current?.plan ?? 'free',
        status: current?.status ?? 'active',
        priceFcfa: current?.priceFcfa ?? 0,
        currentPeriodEnd: current?.currentPeriodEnd ?? null,
        projectLimitOverride: input.projectLimit ?? null,
        memberLimitOverride: input.memberLimit ?? null,
        quotaOverrideUntil: until,
        note: input.reason,
      },
      update: {
        projectLimitOverride: input.projectLimit ?? null,
        memberLimitOverride: input.memberLimit ?? null,
        quotaOverrideUntil: until,
        note: input.reason,
      },
      select: { projectLimitOverride: true, memberLimitOverride: true, quotaOverrideUntil: true },
    })

    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: 'organization.quota.override',
      target: { type: 'organization', id: organization.id },
      organizationId: organization.id,
      details: {
        projectLimit: input.projectLimit ?? null,
        memberLimit: input.memberLimit ?? null,
        until: until.toISOString(),
        reason: input.reason,
      },
      request,
    })
    return NextResponse.json({ subscription })
  }

  // ── Levée du verrou manuel et des quotas dérogatoires ─────────────────────
  await prisma.subscription.updateMany({
    where: { organizationId: organization.id },
    data: {
      manualOverride: false,
      manualOverrideAt: null,
      manualOverrideBy: null,
      manualOverrideReason: null,
      projectLimitOverride: null,
      memberLimitOverride: null,
      quotaOverrideUntil: null,
      note: input.reason,
    },
  })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'organization.override.clear',
    target: { type: 'organization', id: organization.id },
    organizationId: organization.id,
    details: { reason: input.reason },
    request,
  })
  return NextResponse.json({ ok: true })
}
