/**
 * Maintenance automatique des abonnements (relance de #18).
 *
 * La plateforme n'encaisse **aucun paiement récurrent** : ce module ne facture
 * jamais et n'appelle ni Kkiapay ni FedaPay. Il constate seulement les
 * échéances et applique les règles suivantes, de façon idempotente :
 *
 * - `active`/`trialing` dont `currentPeriodEnd` est dépassé → `past_due` avec
 *   `graceUntil = graceDeadline(...)` : 7 jours à partir de l'échéance si elle
 *   est future, sinon 7 jours à partir du constat. Pendant la grâce,
 *   `lib/billing.ts` conserve les limites du plan souscrit ;
 * - `past_due` dont la grâce est dépassée → dernier rappel. Le statut **reste
 *   `past_due`** : `lib/billing.ts` bloque ainsi les créations et les nouveaux
 *   déploiements, sans jamais supprimer une application ni une donnée ;
 * - paiements `pending` de plus de 24 h → `expired` (même règle que
 *   `GET /api/billing/payments`) ;
 * - `manualOverride` → jamais touché (geste commercial d'un administrateur).
 *
 * Idempotence : l'écriture est conditionnelle (statut + échéance observés) et
 * les notifications portent une `dedupeKey` stable par abonnement et période,
 * donc deux exécutions concurrentes ou rapprochées ne produisent ni double
 *transition ni doublon de notification.
 */
import { prisma } from '@/lib/prisma'
import { publish, type PublishInput } from '@/lib/event-bus'
import { graceDeadline } from '@/lib/billing'
import { memberIds, notify, type NotifyInput } from '@/lib/notifications'
import { planById } from '@/lib/plans'

/** Fréquence d'exécution dans le worker (toutes les 6 heures). */
export const BILLING_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Durée de vie d'un paiement `pending` avant expiration (24 heures). */
export const PENDING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000

/** Chemin interne proposé dans les notifications de facturation. */
export const BILLING_NOTIFICATION_HREF = '/dashboard/organization'

/** Champs strictement nécessaires pour décider du sort d'un abonnement. */
export interface SubscriptionSnapshot {
  id: string
  organizationId: string
  status: string
  plan: string
  currentPeriodEnd: Date | null
  graceUntil: Date | null
  manualOverride: boolean
}

export type RenewalAction = 'none' | 'start_grace' | 'end_grace'

export type BillingMaintenanceNotification = 'grace_started' | 'grace_ended'

export interface RenewalDecision {
  action: RenewalAction
  /** Statut à écrire en base ; `null` = ne rien écrire. */
  status: string | null
  graceUntil: Date | null
  /** Notification à garantir (l'envoi lui-même reste idempotent). */
  notification: BillingMaintenanceNotification | null
  /** Identité stable de la période concernée (abonnement + date). */
  periodKey: string | null
  /** Motif lisible, utile au journal et aux tests. */
  reason: string
}

const NONE = {
  action: 'none',
  status: null,
  graceUntil: null,
  notification: null,
  periodKey: null,
} as const

function periodKey(subscription: SubscriptionSnapshot, end: Date | null): string {
  return `${subscription.id}:${end ? end.toISOString() : 'sans-echeance'}`
}

/**
 * Décide ce que la maintenance doit faire pour un abonnement, sans effet de
 * bord. Fonction pure : le temps est fourni par l'appelant.
 */
export function decideRenewal(
  subscription: SubscriptionSnapshot,
  now: Date,
): RenewalDecision {
  // Un plan accordé manuellement par un administrateur n'est jamais écrasé,
  // quelle que soit l'échéance : c'est un geste commercial qui ne se périme pas
  // tout seul.
  if (subscription.manualOverride) {
    return { ...NONE, graceUntil: subscription.graceUntil, reason: 'plan accordé manuellement : aucune action' }
  }

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    if (!subscription.currentPeriodEnd) {
      // Sans échéance connue, il n'y a rien à constater : ne pas couper un
      // abonnement sur une supposition.
      return { ...NONE, reason: 'échéance inconnue : aucune action' }
    }
    if (subscription.currentPeriodEnd.getTime() > now.getTime()) {
      return { ...NONE, reason: 'période en cours' }
    }
    return {
      action: 'start_grace',
      status: 'past_due',
      graceUntil: graceDeadline(subscription.currentPeriodEnd, now),
      notification: 'grace_started',
      periodKey: periodKey(subscription, subscription.currentPeriodEnd),
      reason: 'échéance dépassée : ouverture de la période de grâce',
    }
  }

  if (subscription.status === 'past_due') {
    const graceActive =
      subscription.graceUntil != null && subscription.graceUntil.getTime() > now.getTime()
    if (graceActive) {
      // La notification est « garantie » à chaque passage : la `dedupeKey`
      // stable évite le doublon et permet de rattraper un envoi manqué.
      return {
        action: 'none',
        status: null,
        graceUntil: subscription.graceUntil,
        notification: 'grace_started',
        periodKey: periodKey(
          subscription,
          subscription.currentPeriodEnd ?? subscription.graceUntil,
        ),
        reason: 'période de grâce en cours',
      }
    }
    return {
      action: 'end_grace',
      // Le statut est volontairement conservé : `past_due` est l'état bloquant
      // pour les nouvelles créations/déploiements, et les applications en ligne
      // restent intactes. Passer en `cancelled` lèverait ce blocage.
      status: null,
      graceUntil: subscription.graceUntil,
      notification: 'grace_ended',
      periodKey: periodKey(
        subscription,
        subscription.graceUntil ?? subscription.currentPeriodEnd,
      ),
      reason: 'période de grâce terminée sans régularisation',
    }
  }

  return { ...NONE, reason: 'statut sans maintenance automatique' }
}

export interface PendingPaymentSnapshot {
  id: string
  createdAt: Date
}

export interface PendingPaymentsDecision {
  cutoff: Date
  /** Paiements à passer en `expired`. */
  expired: string[]
  /** Paiements encore récents, laissés en attente. */
  kept: string[]
}

/**
 * Règle pure d'expiration des paiements abandonnés : strictement plus de 24 h
 * (comme la route d'historique, qui filtre avec `lt`). Aucun paiement n'est
 * supprimé, seulement marqué `expired`.
 */
export function decidePendingPayments(
  payments: readonly PendingPaymentSnapshot[],
  now: Date,
  ttlMs = PENDING_PAYMENT_TTL_MS,
): PendingPaymentsDecision {
  const cutoff = new Date(now.getTime() - ttlMs)
  const expired: string[] = []
  const kept: string[] = []
  for (const payment of payments) {
    if (payment.createdAt.getTime() < cutoff.getTime()) expired.push(payment.id)
    else kept.push(payment.id)
  }
  return { cutoff, expired, kept }
}

export interface BillingRenewalDeps {
  /** Abonnements à examiner (actifs, en essai ou en retard). */
  listSubscriptions: (now: Date) => Promise<SubscriptionSnapshot[]>
  /**
   * Écriture conditionnelle : renvoie `false` si une autre transition a gagné
   * (paiement reçu, action d'administration, autre instance).
   */
  updateSubscription: (
    subscription: SubscriptionSnapshot,
    change: { status: string; graceUntil: Date | null },
  ) => Promise<boolean>
  /** Destinataires : propriétaires, administrateurs et rôle facturation. */
  listBillingRecipients: (organizationId: string) => Promise<string[]>
  notify: (input: NotifyInput) => Promise<string[]>
  publish: (input: PublishInput) => Promise<void>
  /** Marque `expired` les paiements `pending` créés avant `createdBefore`. */
  expirePendingPayments: (createdBefore: Date) => Promise<number>
}

export interface BillingMaintenanceResult {
  /** Vrai si une exécution était déjà en cours dans ce processus. */
  skipped: boolean
  checked: number
  graceStarted: number
  /** Passages en fin de grâce effectivement notifiés. */
  graceEnded: number
  /** Notifications réellement créées (tous destinataires confondus). */
  notifications: number
  paymentsExpired: number
}

const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

function formatDate(date: Date | null): string | null {
  return date ? dateFr.format(date) : null
}

interface NotificationContent {
  type: BillingMaintenanceNotification
  title: string
  body: string
  dedupeKey: string
}

/** Contenu français de la notification, sans secret ni valeur technique. */
export function renewalNotification(
  subscription: SubscriptionSnapshot,
  decision: RenewalDecision,
): NotificationContent | null {
  if (!decision.notification || !decision.periodKey) return null
  const plan = planById(subscription.plan)
  const periodEnd = formatDate(subscription.currentPeriodEnd)
  const graceEnd = formatDate(subscription.graceUntil)

  if (decision.notification === 'grace_started') {
    return {
      type: 'grace_started',
      title: `Abonnement ${plan.label} : paiement en retard`,
      body:
        `Le paiement de votre abonnement ${plan.label} n’a pas été reçu` +
        `${periodEnd ? ` avant le ${periodEnd}` : ''}. ` +
        `Vos avantages sont maintenus${graceEnd ? ` jusqu’au ${graceEnd}` : ' pendant 7 jours'}. ` +
        'Régularisez le paiement depuis Équipe → Abonnement : passé ce délai, la création de projets et les nouveaux déploiements seront bloqués. ' +
        'Vos applications en ligne et vos données restent intactes.',
      dedupeKey: `billing:grace-start:${decision.periodKey}`,
    }
  }

  return {
    type: 'grace_ended',
    title: `Abonnement ${plan.label} : période de grâce terminée`,
    body:
      `La période de grâce s’est terminée${graceEnd ? ` le ${graceEnd}` : ''} sans régularisation. ` +
      'La création de projets et les nouveaux déploiements sont bloqués ; ' +
      'vos applications en ligne et vos données restent intactes. ' +
      'Régularisez le paiement depuis Équipe → Abonnement pour réactiver l’organisation.',
    dedupeKey: `billing:grace-end:${decision.periodKey}`,
  }
}

// Verrou simple par processus : le worker peut déclencher la maintenance au
// démarrage puis par intervalle, sans jamais superposer deux exécutions.
// Limite connue : plusieurs instances du portail ont chacune leur verrou ; les
// écritures conditionnelles et les `dedupeKey` rendent malgré tout l'ensemble
// idempotent. Un job répétable BullMQ (un seul leader) pourra remplacer ce
// minuteur plus tard.
let maintenanceRunning = false

async function notifyRenewal(
  deps: BillingRenewalDeps,
  subscription: SubscriptionSnapshot,
  decision: RenewalDecision,
): Promise<number> {
  const content = renewalNotification(subscription, decision)
  if (!content) return 0
  const recipients = await deps.listBillingRecipients(subscription.organizationId)
  if (recipients.length === 0) return 0
  const notified = await deps.notify({
    userIds: recipients,
    type: content.type === 'grace_started' ? 'billing.grace_started' : 'billing.grace_ended',
    title: content.title,
    body: content.body,
    href: BILLING_NOTIFICATION_HREF,
    organizationId: subscription.organizationId,
    dedupeKey: content.dedupeKey,
  })
  return notified.length
}

/**
 * Exécute une passe de maintenance. Idempotent et reprenable : une erreur sur
 * un abonnement n'empêche pas de traiter les suivants. Aucune suppression n'est
 * possible (les dépendances n'exposent aucune opération destructive).
 */
export async function runBillingMaintenance(
  deps: BillingRenewalDeps,
  options: { now?: Date } = {},
): Promise<BillingMaintenanceResult> {
  const result: BillingMaintenanceResult = {
    skipped: false,
    checked: 0,
    graceStarted: 0,
    graceEnded: 0,
    notifications: 0,
    paymentsExpired: 0,
  }
  if (maintenanceRunning) return { ...result, skipped: true }
  maintenanceRunning = true

  const now = options.now ?? new Date()
  try {
    const subscriptions = await deps.listSubscriptions(now)
    for (const subscription of subscriptions) {
      result.checked += 1
      try {
        const decision = decideRenewal(subscription, now)

        if (decision.action === 'start_grace' && decision.status) {
          const applied = await deps.updateSubscription(subscription, {
            status: decision.status,
            graceUntil: decision.graceUntil,
          })
          // Une transition concurrente (paiement, action admin, autre instance)
          // a gagné : on ne notifie pas un impayé qui n'existe plus.
          if (!applied) continue
          result.graceStarted += 1
          await deps.publish({
            type: 'subscription.updated',
            organizationId: subscription.organizationId,
            payload: {
              plan: subscription.plan,
              status: decision.status,
              graceUntil: decision.graceUntil?.toISOString() ?? null,
              reason: 'period_ended',
            },
          })
        }

        if (!decision.notification) continue
        const notified = await notifyRenewal(deps, subscription, decision)
        result.notifications += notified

        if (decision.action === 'end_grace' && notified > 0) {
          result.graceEnded += 1
          await deps.publish({
            type: 'subscription.updated',
            organizationId: subscription.organizationId,
            payload: {
              plan: subscription.plan,
              status: 'past_due',
              graceUntil: decision.graceUntil?.toISOString() ?? null,
              reason: 'grace_ended',
            },
          })
        }
      } catch (error) {
        console.error(
          '[eflex/billing] maintenance impossible pour un abonnement :',
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    try {
      const cutoff = new Date(now.getTime() - PENDING_PAYMENT_TTL_MS)
      result.paymentsExpired = await deps.expirePendingPayments(cutoff)
    } catch (error) {
      console.error(
        '[eflex/billing] expiration des paiements impossible :',
        error instanceof Error ? error.message : String(error),
      )
    }

    return result
  } finally {
    maintenanceRunning = false
  }
}

/**
 * Dépendances réelles (Prisma + notifications). `organizationId` permet de
 * restreindre la passe à une organisation (tests d'intégration, maintenance
 * ciblée) ; la production balaie toutes les organisations.
 */
export function createBillingMaintenanceDeps(
  options: { organizationId?: string } = {},
): BillingRenewalDeps {
  const scope = options.organizationId ? { organizationId: options.organizationId } : {}

  return {
    listSubscriptions: (now) =>
      prisma.subscription.findMany({
        where: {
          ...scope,
          status: { in: ['active', 'trialing', 'past_due'] },
          OR: [
            { currentPeriodEnd: { lte: now } },
            { graceUntil: { not: null } },
          ],
        },
        select: {
          id: true,
          organizationId: true,
          status: true,
          plan: true,
          currentPeriodEnd: true,
          graceUntil: true,
          manualOverride: true,
        },
      }),

    updateSubscription: async (subscription, change) => {
      const updated = await prisma.subscription.updateMany({
        where: {
          id: subscription.id,
          status: subscription.status,
          manualOverride: false,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        data: { status: change.status, graceUntil: change.graceUntil },
      })
      return updated.count === 1
    },

    listBillingRecipients: (organizationId) =>
      memberIds(organizationId, ['owner', 'admin', 'billing']),

    notify: (input) => notify(input),
    publish: (input) => publish(input),

    expirePendingPayments: async (createdBefore) => {
      const updated = await prisma.payment.updateMany({
        where: { ...scope, status: 'pending', createdAt: { lt: createdBefore } },
        data: { status: 'expired' },
      })
      return updated.count
    },
  }
}

let maintenanceTimer: ReturnType<typeof setInterval> | null = null

async function runScheduledBillingMaintenance(): Promise<void> {
  try {
    const result = await runBillingMaintenance(createBillingMaintenanceDeps())
    if (result.skipped) return
    if (result.graceStarted > 0 || result.graceEnded > 0 || result.paymentsExpired > 0) {
      console.info(
        `[eflex/billing] maintenance : ${result.graceStarted} grâce(s) ouverte(s), ` +
          `${result.graceEnded} fin(s) de grâce, ${result.notifications} notification(s), ` +
          `${result.paymentsExpired} paiement(s) expiré(s).`,
      )
    }
  } catch (error) {
    console.error(
      '[eflex/billing] maintenance automatique impossible :',
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * Démarre la maintenance dans le processus du worker : une passe immédiate
 * (rattrapage après redémarrage) puis toutes les 6 heures. `unref()` évite de
 * retenir le processus. Un seul minuteur par processus, même après HMR.
 */
export function startBillingMaintenance(): void {
  if (maintenanceTimer) return
  maintenanceTimer = setInterval(() => {
    void runScheduledBillingMaintenance()
  }, BILLING_MAINTENANCE_INTERVAL_MS)
  maintenanceTimer.unref()
  void runScheduledBillingMaintenance()
}
