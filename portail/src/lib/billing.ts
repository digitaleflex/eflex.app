import { prisma } from '@/lib/prisma'
import {
  GRACE_PERIOD_DAYS,
  PERIOD_DAYS,
  isActiveSubscription,
  planById,
  type Plan,
  type PlanId,
} from '@/lib/plans'

export { GRACE_PERIOD_DAYS, PERIOD_DAYS }

/** Code d'erreur renvoyé aux clients quand la facturation bloque une action. */
export type BillingBlockCode = 'organization_suspended' | 'payment_past_due'

/** Phase lisible de l'abonnement, dérivée des dates (jamais un statut stocké brut). */
export type BillingPhase = 'free' | 'trialing' | 'active' | 'past_due' | 'expired' | 'pending' | 'cancelled'

export interface BillingLimits {
  projects: number
  members: number
  customDomains: number
}

export interface OrganizationBillingState {
  organizationId: string
  /** Statut brut en base (`free` s'il n'y a pas d'abonnement). */
  status: string
  phase: BillingPhase
  /** Plan dont les limites s'appliquent réellement maintenant. */
  plan: Plan
  /** Plan souscrit en base (même si la période est échue ou la grâce terminée). */
  subscribedPlan: Plan
  periodEnd: Date | null
  graceUntil: Date | null
  /** Jours restants de grâce (arrondi supérieur), `null` hors `past_due`. */
  graceDaysLeft: number | null
  expired: boolean
  suspended: boolean
  suspendedAt: Date | null
  suspensionReason: string | null
  /** Vrai si un nouveau déploiement doit être refusé. */
  blocked: boolean
  blockCode: BillingBlockCode | null
  /** Message utilisateur prêt à afficher (français). */
  message: string | null
  limits: BillingLimits
  creditFcfa: number
  manualOverride: boolean
  pendingPlan: string | null
}

const DAY_MS = 86_400_000

export const SUSPENDED_MESSAGE =
  'Cette organisation est suspendue : la création de projets et les nouveaux déploiements sont bloqués. Les applications déjà en ligne et vos données restent intactes. Contactez le support Eflex pour la réactiver.'

const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

export function pastDueMessage(graceUntil: Date | null): string {
  const until = graceUntil ? ` La période de grâce s’est terminée le ${dateFr.format(graceUntil)}.` : ''
  return `Le paiement de l’abonnement est en retard.${until} La création de projets et les nouveaux déploiements sont bloqués ; les applications déjà en ligne et vos données restent actives. Régularisez le paiement depuis Équipe → Abonnement pour réactiver l’organisation.`
}

/** Limites appliquées : plan, puis dérive temporaire accordée par un administrateur. */
export function effectiveLimits(
  plan: Plan,
  subscription?: {
    projectLimitOverride?: number | null
    memberLimitOverride?: number | null
    quotaOverrideUntil?: Date | null
  } | null,
  now = new Date(),
): BillingLimits {
  const overrideActive =
    subscription?.quotaOverrideUntil == null || subscription.quotaOverrideUntil.getTime() > now.getTime()
  return {
    projects:
      overrideActive && subscription?.projectLimitOverride != null
        ? subscription.projectLimitOverride
        : plan.projectLimit,
    members:
      overrideActive && subscription?.memberLimitOverride != null
        ? subscription.memberLimitOverride
        : plan.memberLimit,
    customDomains: plan.customDomainLimit,
  }
}

/**
 * État de facturation complet d'une organisation, calculé à partir de la base.
 *
 * Règles de cycle de vie (documentées dans `docs`/ce module) :
 * - `active`/`trialing` sans échéance = actif ; avec échéance dépassée = période
 *   échue → plan gratuit, nouveaux déploiements toujours autorisés (le gratuit
 *   suffit), création de projets soumise aux quotas du plan gratuit ;
 * - `past_due` : les limites du plan payant restent actives jusqu'à `graceUntil`
 *   (7 jours par défaut), puis les nouveaux déploiements sont bloqués sans
 *   toucher aux applications en ligne ;
 * - `cancelled`/`pending` = plan gratuit ;
 * - organisation suspendue = blocage immédiat des créations et déploiements.
 */
export async function loadBillingState(
  organizationId: string,
  now = new Date(),
): Promise<OrganizationBillingState> {
  const [organization, subscription] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { suspendedAt: true, suspensionReason: true },
    }),
    prisma.subscription.findUnique({ where: { organizationId } }),
  ])
  return computeBillingState(
    {
      organizationId,
      suspendedAt: organization?.suspendedAt ?? null,
      suspensionReason: organization?.suspensionReason ?? null,
      subscription,
    },
    now,
  )
}

/** Partie pure de l'état de facturation, utilisable par les listes d'administration. */
export function computeBillingState(
  input: {
    organizationId: string
    suspendedAt: Date | null
    suspensionReason: string | null
    subscription:
      | {
          status: string
          plan: string
          pendingPlan: string | null
          currentPeriodEnd: Date | null
          graceUntil: Date | null
          creditFcfa: number
          manualOverride: boolean
          projectLimitOverride: number | null
          memberLimitOverride: number | null
          quotaOverrideUntil: Date | null
        }
      | null
      | undefined
  },
  now = new Date(),
): OrganizationBillingState {
  const { organizationId, subscription } = input
  const organization = { suspendedAt: input.suspendedAt, suspensionReason: input.suspensionReason }

  const status = subscription?.status ?? 'free'
  const subscribedPlan = planById(subscription?.plan)
  const freePlan = planById('free')
  const suspended = organization?.suspendedAt != null
  const graceUntil = subscription?.graceUntil ?? null
  const graceActive = status === 'past_due' && graceUntil != null && graceUntil.getTime() > now.getTime()
  const periodEnd = subscription?.currentPeriodEnd ?? null
  const expired =
    (status === 'active' || status === 'trialing') &&
    periodEnd != null &&
    periodEnd.getTime() <= now.getTime()

  let phase: BillingPhase
  let plan: Plan
  if (status === 'free' || !subscription) {
    phase = 'free'
    plan = freePlan
  } else if (status === 'trialing') {
    phase = expired ? 'expired' : 'trialing'
    plan = expired ? freePlan : subscribedPlan
  } else if (status === 'active' && !expired) {
    phase = 'active'
    plan = subscribedPlan
  } else if (status === 'active' && expired) {
    phase = 'expired'
    plan = freePlan
  } else if (status === 'past_due') {
    phase = 'past_due'
    plan = graceActive ? subscribedPlan : freePlan
  } else if (status === 'cancelled') {
    phase = 'cancelled'
    plan = freePlan
  } else if (status === 'pending') {
    // Demande d'activation : les limites payantes ne s'appliquent pas encore.
    phase = 'pending'
    plan = freePlan
  } else {
    phase = 'cancelled'
    plan = freePlan
  }

  const pastDueBlocked = status === 'past_due' && !graceActive
  const blocked = suspended || pastDueBlocked
  const blockCode: BillingBlockCode | null = suspended
    ? 'organization_suspended'
    : pastDueBlocked
      ? 'payment_past_due'
      : null
  const message = suspended
    ? organization?.suspensionReason
      ? `${SUSPENDED_MESSAGE} Motif : ${organization.suspensionReason}`
      : SUSPENDED_MESSAGE
    : pastDueBlocked
      ? pastDueMessage(graceUntil)
      : null

  return {
    organizationId,
    status,
    phase,
    plan,
    subscribedPlan,
    periodEnd,
    graceUntil,
    graceDaysLeft: graceActive
      ? Math.max(1, Math.ceil((graceUntil.getTime() - now.getTime()) / DAY_MS))
      : null,
    expired,
    suspended,
    suspendedAt: organization?.suspendedAt ?? null,
    suspensionReason: organization?.suspensionReason ?? null,
    blocked,
    blockCode,
    message,
    limits: effectiveLimits(plan, subscription, now),
    creditFcfa: subscription?.creditFcfa ?? 0,
    manualOverride: subscription?.manualOverride ?? false,
    pendingPlan: subscription?.pendingPlan ?? null,
  }
}

/** Plan effectif d'une organisation (limites réellement applicables). */
export async function effectivePlan(organizationId: string): Promise<Plan> {
  return (await loadBillingState(organizationId)).plan
}

/**
 * Garde commune des actions qui créent un déploiement (création de projet,
 * redéploiement, domaine, webhook GitHub). Ne regarde **pas** les applications
 * déjà en ligne : elles continuent de tourner.
 */
export async function assertDeploymentAllowed(
  organizationId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: BillingBlockCode; status: number }> {
  const state = await loadBillingState(organizationId)
  if (!state.blocked || !state.message) return { ok: true }
  return {
    ok: false,
    error: state.message,
    code: state.blockCode ?? 'payment_past_due',
    status: state.blockCode === 'organization_suspended' ? 403 : 402,
  }
}

/** Compatibilité : vrai si le statut brut donne les limites payantes (hors grâce). */
export function isPaidStatus(status: string | null | undefined): boolean {
  return isActiveSubscription(status)
}

export interface BillingSummary {
  plan: Plan
  subscribedPlan: Plan
  status: string
  phase: BillingPhase
  requestedPlan: string | null
  currentPeriodEnd: Date | null
  graceUntil: Date | null
  graceDaysLeft: number | null
  priceFcfa: number
  creditFcfa: number
  suspended: boolean
  blocked: boolean
  blockCode: BillingBlockCode | null
  message: string | null
  manualOverride: boolean
  usage: {
    projects: number
    members: number
  }
  limits: BillingLimits
}

/** Résumé complet pour l'interface (plan, statut, consommation). */
export async function billingSummary(organizationId: string): Promise<BillingSummary> {
  const [state, projects, members] = await Promise.all([
    loadBillingState(organizationId),
    prisma.project.count({ where: { organizationId } }),
    prisma.member.count({ where: { organizationId } }),
  ])

  return {
    plan: state.plan,
    subscribedPlan: state.subscribedPlan,
    status: state.status,
    phase: state.phase,
    requestedPlan: state.pendingPlan,
    currentPeriodEnd: state.periodEnd,
    graceUntil: state.graceUntil,
    graceDaysLeft: state.graceDaysLeft,
    priceFcfa: state.plan.priceFcfa,
    creditFcfa: state.creditFcfa,
    suspended: state.suspended,
    blocked: state.blocked,
    blockCode: state.blockCode,
    message: state.message,
    manualOverride: state.manualOverride,
    usage: { projects, members },
    limits: state.limits,
  }
}

/** Message d'invitation au plan supérieur, commun aux quotas projets et membres. */
export function upgradeMessage(plan: Plan, resource: string, limit: number): string {
  if (plan.id === 'free') {
    return `Le plan ${plan.label} est limité à ${limit} ${resource}. Choisissez un plan supérieur dans Équipe → Abonnement pour continuer.`
  }
  return `Le plan ${plan.label} est limité à ${limit} ${resource}. Passez à un plan supérieur dans Équipe → Abonnement pour continuer.`
}

/**
 * Message de quota exprimé en **applications** (lot C de D2) : `projectLimit`
 * garde son nom pour la compatibilité de `Subscription`, mais son unité est
 * l'application déployable.
 */
export function appQuotaMessage(
  plan: Plan,
  additional: number,
  limit: number,
  used: number,
): string {
  const added = Math.max(1, additional)
  const plural = added > 1 ? 's' : ''
  const usedLabel = used > 1 ? 'utilisées' : 'utilisée'
  const upgrade =
    plan.id === 'free'
      ? 'Choisissez un plan supérieur dans Équipe → Abonnement pour continuer.'
      : 'Passez à un plan supérieur dans Équipe → Abonnement pour continuer.'
  return `Cette création ajoute ${added} application${plural} ; le plan ${plan.label} en autorise ${limit} (${used} déjà ${usedLabel}). ${upgrade}`
}

/**
 * Vérifie le quota avant création. L'unité comptée est l'**application**
 * (`ProjectApp`) : un projet sans application backfillée (données antérieures
 * à D2) compte pour une application implicite. `additional` permet de refuser
 * en bloc une création de N applications avant toute analyse et toute écriture.
 */
export async function assertProjectQuota(
  organizationId: string,
  additional = 1,
): Promise<{ ok: true } | { error: string; plan: Plan; required: number; limit: number; used: number }> {
  const [state, apps, implicitProjects] = await Promise.all([
    loadBillingState(organizationId),
    prisma.projectApp.count({ where: { project: { organizationId } } }),
    // Projet historique sans `ProjectApp` : une application implicite.
    prisma.project.count({ where: { organizationId, apps: { none: {} } } }),
  ])
  const used = apps + implicitProjects
  const required = Math.max(1, additional)
  const limit = state.limits.projects
  if (used + required > limit) {
    return {
      plan: state.plan,
      required,
      limit,
      used,
      error: appQuotaMessage(state.plan, required, limit, used),
    }
  }
  return { ok: true }
}

/**
 * Vérifie le quota de membres. À l'invitation on compte aussi les invitations en
 * attente (sinon on pourrait dépasser la limite en invitant en rafale) ; à
 * l'acceptation on ne compte que les membres réels (une invitation peut avoir
 * été créée avant une rétrogradation de plan).
 */
export async function assertMemberQuota(
  organizationId: string,
  options: { includePendingInvitations?: boolean } = {},
): Promise<{ ok: true } | { error: string; plan: Plan; limit: number }> {
  const [state, members, pending] = await Promise.all([
    loadBillingState(organizationId),
    prisma.member.count({ where: { organizationId } }),
    options.includePendingInvitations
      ? prisma.invitation.count({ where: { organizationId, status: 'pending' } })
      : Promise.resolve(0),
  ])
  const used = members + pending
  if (used >= state.limits.members) {
    return {
      plan: state.plan,
      limit: state.limits.members,
      error: upgradeMessage(state.plan, 'membres', state.limits.members),
    }
  }
  return { ok: true }
}

/**
 * Règle de prorata retenue (simple, jamais de remboursement en numéraire) :
 * lors d'un changement de plan en cours de période, la valeur non consommée de
 * l'ancien plan est créditée au prorata des jours restants sur 30 jours. Ce
 * crédit est stocké sur l'abonnement et déduit du prochain paiement en ligne.
 * Si le nouveau plan est gratuit, le crédit reste disponible pour un futur
 * passage à un plan payant.
 */
export function prorationCreditFcfa(
  currentPlan: Plan,
  currentPeriodEnd: Date | null,
  now = new Date(),
): number {
  if (currentPlan.priceFcfa <= 0 || !currentPeriodEnd) return 0
  const remainingDays = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / DAY_MS)
  if (remainingDays <= 0) return 0
  const days = Math.min(PERIOD_DAYS, remainingDays)
  return Math.max(0, Math.round((currentPlan.priceFcfa * days) / PERIOD_DAYS))
}

/** Fin de période proposée lors d'un passage à un plan payant. */
export function nextPeriodEnd(currentPeriodEnd: Date | null, now = new Date()): Date {
  const start =
    currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd.getTime() : now.getTime()
  return new Date(start + PERIOD_DAYS * DAY_MS)
}

/** Date de fin de grâce après un impayé : 7 jours après l'échéance (ou maintenant). */
export function graceDeadline(periodEnd: Date | null, now = new Date()): Date {
  const start = periodEnd && periodEnd.getTime() > now.getTime() ? periodEnd.getTime() : now.getTime()
  return new Date(start + GRACE_PERIOD_DAYS * DAY_MS)
}

/** Vrai si le plan est payant (sert à décider du prorata et des dates). */
export function isPaidPlan(plan: Plan): boolean {
  return plan.priceFcfa > 0
}

export type { Plan, PlanId }
