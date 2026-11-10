import { afterAll, describe, expect, it } from 'vitest'
import {
  BILLING_MAINTENANCE_INTERVAL_MS,
  BILLING_NOTIFICATION_HREF,
  PENDING_PAYMENT_TTL_MS,
  decidePendingPayments,
  decideRenewal,
  renewalNotification,
  runBillingMaintenance,
  type BillingRenewalDeps,
  type SubscriptionSnapshot,
} from './billing-renewal'
import type { NotifyInput } from './notifications'
import type { PublishInput } from './event-bus'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY)

function subscription(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    id: 'sub_1',
    organizationId: 'org_1',
    status: 'active',
    plan: 'starter',
    currentPeriodEnd: at(10),
    graceUntil: null,
    manualOverride: false,
    ...overrides,
  }
}

/** Dépendances en mémoire : aucun accès Prisma, Redis ou e-mail. */
function fakeDeps(
  rows: SubscriptionSnapshot[],
  options: { recipients?: string[]; paymentsExpired?: number } = {},
) {
  const state = rows.map((row) => ({ ...row }))
  const updates: Array<{ subscription: SubscriptionSnapshot; change: { status: string; graceUntil: Date | null } }> = []
  const sent: NotifyInput[] = []
  const published: PublishInput[] = []
  const notifiedKeys = new Set<string>()
  const recipients = options.recipients ?? ['owner-1', 'admin-1', 'billing-1']

  const deps: BillingRenewalDeps = {
    listSubscriptions: async () => state,

    // Reproduit l'écriture conditionnelle réelle : id + statut + échéance
    // observés, et jamais un plan accordé manuellement.
    updateSubscription: async (snapshot, change) => {
      const current = state.find((row) => row.id === snapshot.id)
      if (!current || current.manualOverride) return false
      if (current.status !== snapshot.status) return false
      const sameEnd =
        (current.currentPeriodEnd?.getTime() ?? null) ===
        (snapshot.currentPeriodEnd?.getTime() ?? null)
      if (!sameEnd) return false
      current.status = change.status
      current.graceUntil = change.graceUntil
      updates.push({ subscription: snapshot, change })
      return true
    },

    listBillingRecipients: async () => recipients,

    notify: async (input) => {
      // Même contrainte que la base : (userId, dedupeKey) unique.
      const created = input.userIds.filter((userId) => {
        const key = `${userId}:${input.dedupeKey ?? 'sans-cle'}`
        if (notifiedKeys.has(key)) return false
        notifiedKeys.add(key)
        return true
      })
      if (created.length > 0) sent.push(input)
      return created
    },

    publish: async (input) => {
      published.push(input)
    },

    expirePendingPayments: async () => options.paymentsExpired ?? 0,
  }

  return { deps, state, updates, sent, published }
}

describe('decideRenewal', () => {
  it('ne touche pas une période encore en cours', () => {
    const decision = decideRenewal(subscription({ currentPeriodEnd: at(1) }), NOW)
    expect(decision.action).toBe('none')
    expect(decision.status).toBeNull()
    expect(decision.notification).toBeNull()
  })

  it('un abonnement actif échu ouvre une grâce de 7 jours', () => {
    const periodEnd = at(-1)
    const decision = decideRenewal(subscription({ currentPeriodEnd: periodEnd }), NOW)
    expect(decision.action).toBe('start_grace')
    expect(decision.status).toBe('past_due')
    expect(decision.graceUntil?.toISOString()).toBe(at(7).toISOString())
    expect(decision.notification).toBe('grace_started')
    expect(decision.periodKey).toContain(periodEnd.toISOString())
  })

  it('une échéance très ancienne donne quand même 7 jours depuis le constat', () => {
    // Le cron peut avoir été arrêté : on ne coupe pas immédiatement un client
    // dont l'échéance date de plusieurs semaines.
    const decision = decideRenewal(subscription({ currentPeriodEnd: at(-45) }), NOW)
    expect(decision.action).toBe('start_grace')
    expect(decision.graceUntil?.toISOString()).toBe(at(7).toISOString())
  })

  it('traite un essai échu comme une période échue', () => {
    const decision = decideRenewal(
      subscription({ status: 'trialing', plan: 'pro', currentPeriodEnd: at(-1) }),
      NOW,
    )
    expect(decision.action).toBe('start_grace')
    expect(decision.status).toBe('past_due')
  })

  it('ne coupe jamais un abonnement sans échéance connue', () => {
    const decision = decideRenewal(subscription({ currentPeriodEnd: null }), NOW)
    expect(decision.action).toBe('none')
    expect(decision.notification).toBeNull()
  })

  it('pendant la grâce, conserve le statut et garantit le rappel', () => {
    const graceUntil = at(4)
    const decision = decideRenewal(
      subscription({ status: 'past_due', currentPeriodEnd: at(-3), graceUntil }),
      NOW,
    )
    expect(decision.action).toBe('none')
    expect(decision.status).toBeNull()
    expect(decision.graceUntil?.toISOString()).toBe(graceUntil.toISOString())
    expect(decision.notification).toBe('grace_started')
  })

  it('après la grâce, garde past_due (donc bloquant) et programme le dernier rappel', () => {
    const graceUntil = at(-1)
    const decision = decideRenewal(
      subscription({ status: 'past_due', currentPeriodEnd: at(-8), graceUntil }),
      NOW,
    )
    expect(decision.action).toBe('end_grace')
    // Statut inchangé : `cancelled` lèverait le blocage des déploiements.
    expect(decision.status).toBeNull()
    expect(decision.graceUntil?.toISOString()).toBe(graceUntil.toISOString())
    expect(decision.notification).toBe('grace_ended')
    expect(decision.periodKey).toContain(graceUntil.toISOString())
  })

  it('ne touche pas un plan accordé manuellement', () => {
    for (const row of [
      subscription({ manualOverride: true, currentPeriodEnd: at(-30) }),
      subscription({ manualOverride: true, status: 'past_due', graceUntil: at(-5) }),
    ]) {
      const decision = decideRenewal(row, NOW)
      expect(decision.action).toBe('none')
      expect(decision.status).toBeNull()
      expect(decision.notification).toBeNull()
    }
  })

  it('ignore les statuts sans maintenance automatique', () => {
    for (const status of ['cancelled', 'pending', 'free']) {
      const decision = decideRenewal(
        subscription({ status, currentPeriodEnd: at(-30), graceUntil: at(-20) }),
        NOW,
      )
      expect(decision.action).toBe('none')
      expect(decision.notification).toBeNull()
    }
  })
})

describe('decidePendingPayments', () => {
  it('expire strictement les paiements de plus de 24 h et garde les autres', () => {
    const decision = decidePendingPayments(
      [
        { id: 'vieux', createdAt: new Date(NOW.getTime() - PENDING_PAYMENT_TTL_MS - 1) },
        { id: 'limite', createdAt: new Date(NOW.getTime() - PENDING_PAYMENT_TTL_MS) },
        { id: 'recent', createdAt: new Date(NOW.getTime() - 60_000) },
      ],
      NOW,
    )
    expect(decision.expired).toEqual(['vieux'])
    expect(decision.kept).toEqual(['limite', 'recent'])
    expect(decision.cutoff.toISOString()).toBe(new Date(NOW.getTime() - PENDING_PAYMENT_TTL_MS).toISOString())
  })
})

describe('renewalNotification', () => {
  it('écrit en français, pointe vers l’abonnement et porte une clé stable', () => {
    const row = subscription({ currentPeriodEnd: at(-1) })
    const decision = decideRenewal(row, NOW)
    const content = renewalNotification(row, decision)!
    expect(content.title).toMatch(/paiement en retard/i)
    expect(content.body).toMatch(/Régularisez/)
    expect(content.dedupeKey).toBe(`billing:grace-start:${decision.periodKey}`)
    expect(BILLING_NOTIFICATION_HREF).toBe('/dashboard/organization')
  })
})

describe('runBillingMaintenance', () => {
  it('ouvre la grâce, notifie les rôles de facturation et publie l’événement', async () => {
    const periodEnd = at(-1)
    const { deps, updates, sent, published } = fakeDeps([
      subscription({ currentPeriodEnd: periodEnd }),
    ])

    const result = await runBillingMaintenance(deps, { now: NOW })

    expect(result.skipped).toBe(false)
    expect(result.checked).toBe(1)
    expect(result.graceStarted).toBe(1)
    expect(result.notifications).toBe(3)
    expect(updates).toHaveLength(1)
    expect(updates[0]!.change.status).toBe('past_due')
    expect(updates[0]!.change.graceUntil?.toISOString()).toBe(at(7).toISOString())

    expect(sent).toHaveLength(1)
    expect(sent[0]!.type).toBe('billing.grace_started')
    expect(sent[0]!.userIds).toEqual(['owner-1', 'admin-1', 'billing-1'])
    expect(sent[0]!.href).toBe('/dashboard/organization')
    expect(sent[0]!.dedupeKey).toBe(`billing:grace-start:${updates[0]!.subscription.id}:${periodEnd.toISOString()}`)

    expect(published).toHaveLength(1)
    expect(published[0]!.type).toBe('subscription.updated')
    expect(published[0]!.payload?.status).toBe('past_due')
  })

  it('est idempotente : deux passes sur la même période ne notifient qu’une fois', async () => {
    const { deps, updates, sent, published } = fakeDeps([subscription({ currentPeriodEnd: at(-1) })])

    await runBillingMaintenance(deps, { now: NOW })
    const second = await runBillingMaintenance(deps, { now: NOW })

    expect(updates).toHaveLength(1) // une seule transition
    expect(sent).toHaveLength(1) // une seule notification
    expect(second.graceStarted).toBe(0)
    expect(second.notifications).toBe(0)
    expect(published).toHaveLength(1)
  })

  it('après la grâce, ne change pas le statut et n’envoie qu’un dernier rappel', async () => {
    const graceUntil = at(-2)
    const { deps, state, updates, sent, published } = fakeDeps([
      subscription({ status: 'past_due', currentPeriodEnd: at(-9), graceUntil }),
    ])

    const result = await runBillingMaintenance(deps, { now: NOW })
    expect(updates).toHaveLength(0)
    expect(result.graceEnded).toBe(1)
    expect(state[0]!.status).toBe('past_due')
    expect(sent[0]!.type).toBe('billing.grace_ended')
    expect(sent[0]!.body).toMatch(/applications en ligne et vos données restent intactes/i)
    expect(published[0]!.payload?.reason).toBe('grace_ended')

    const repeated = await runBillingMaintenance(deps, { now: NOW })
    expect(repeated.graceEnded).toBe(0)
    expect(sent).toHaveLength(1)
    expect(published).toHaveLength(1)
  })

  it('ne dégrade jamais un plan accordé manuellement', async () => {
    const { deps, updates, sent, state } = fakeDeps([
      subscription({ manualOverride: true, currentPeriodEnd: at(-40) }),
    ])

    const result = await runBillingMaintenance(deps, { now: NOW })

    expect(result.graceStarted).toBe(0)
    expect(result.notifications).toBe(0)
    expect(updates).toHaveLength(0)
    expect(sent).toHaveLength(0)
    expect(state[0]!.status).toBe('active')
    expect(state[0]!.currentPeriodEnd?.toISOString()).toBe(at(-40).toISOString())
  })

  it('expire les paiements abandonnés avec la coupure de 24 h', async () => {
    const { deps } = fakeDeps([])
    const seen = { cutoff: null as Date | null }
    deps.expirePendingPayments = async (createdBefore) => {
      seen.cutoff = createdBefore
      return 2
    }

    const result = await runBillingMaintenance(deps, { now: NOW })
    expect(result.paymentsExpired).toBe(2)
    expect(seen.cutoff?.toISOString()).toBe(new Date(NOW.getTime() - 24 * 3600 * 1000).toISOString())
  })

  it('refuse une seconde exécution concurrente dans le même processus', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = 0
    const { deps } = fakeDeps([])
    deps.listSubscriptions = async () => {
      started += 1
      await gate
      return []
    }

    const first = runBillingMaintenance(deps, { now: NOW })
    // Laisse la première passe atteindre son `await`.
    await Promise.resolve()
    const second = await runBillingMaintenance(deps, { now: NOW })
    expect(second.skipped).toBe(true)
    release()
    await first
    expect(started).toBe(1)
  })

  it('une erreur sur un abonnement ne bloque pas les suivants ni l’expiration', async () => {
    const { deps } = fakeDeps([
      subscription({ id: 'sub_a', organizationId: 'org_a', currentPeriodEnd: at(-1) }),
      subscription({ id: 'sub_b', organizationId: 'org_b', currentPeriodEnd: at(-1) }),
    ])
    const update = deps.updateSubscription
    deps.updateSubscription = async (row, change) => {
      if (row.id === 'sub_a') throw new Error('panne simulée')
      return update(row, change)
    }
    deps.expirePendingPayments = async () => 1

    const result = await runBillingMaintenance(deps, { now: NOW })
    expect(result.checked).toBe(2)
    expect(result.graceStarted).toBe(1)
    expect(result.paymentsExpired).toBe(1)
  })

  it('ne supprime aucune donnée : la maintenance ne fait que changer un statut', async () => {
    const { deps, state, updates } = fakeDeps([subscription({ currentPeriodEnd: at(-1) })])

    await runBillingMaintenance(deps, { now: NOW })

    // Le contrat de dépendances n'expose aucune opération destructive : seules
    // des lectures, une écriture de statut, des notifications et des événements.
    expect(Object.keys(deps).sort()).toEqual(
      ['expirePendingPayments', 'listBillingRecipients', 'listSubscriptions', 'notify', 'publish', 'updateSubscription'].sort(),
    )
    expect(updates).toHaveLength(1)
    expect(state).toHaveLength(1)
    expect(state[0]!.status).toBe('past_due')
  })
})

describe('constantes de maintenance', () => {
  it('s’exécute toutes les 6 heures', () => {
    expect(BILLING_MAINTENANCE_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
  })
})

// Intégration : EFLEX_TEST_DB=1 + base PostgreSQL migrée (`DATABASE_URL`).
// La passe est restreinte à l'organisation créée pour ne pas bousculer les
// abonnements des autres suites.
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

run('maintenance de facturation (base réelle)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  delete process.env.RESEND_API_KEY

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('ouvre la grâce, notifie owner/billing, conserve le projet, puis clôt la grâce sans le supprimer', async () => {
    const { prisma } = await import('@/lib/prisma')
    const { createBillingMaintenanceDeps } = await import('@/lib/billing-renewal')
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const mkUser = async (name: string) =>
      (await prisma.user.create({ data: { name, email: `${name}-${stamp}@exemple.fr` } })).id

    const owner = await mkUser('owner')
    const billing = await mkUser('billing')
    const member = await mkUser('member')
    const organization = await prisma.organization.create({
      data: {
        name: 'Org maintenance',
        slug: `maintenance-${stamp}`,
        members: {
          create: [
            { userId: owner, role: 'owner' },
            { userId: billing, role: 'billing' },
            { userId: member, role: 'member' },
          ],
        },
      },
    })
    const periodEnd = new Date(Date.now() - DAY)
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        plan: 'starter',
        status: 'active',
        priceFcfa: 12_000,
        currentPeriodEnd: periodEnd,
      },
    })
    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        userId: owner,
        name: 'Application conservée',
        slug: `conservee-${stamp}`,
        repoUrl: 'https://github.com/exemple/conservee',
        framework: 'node',
        coolifyAppId: 'app-conservee',
      },
    })
    const oldPayment = await prisma.payment.create({
      data: {
        reference: `ref-${stamp}-vieux`,
        organizationId: organization.id,
        userId: owner,
        plan: 'starter',
        provider: 'kkiapay',
        amountFcfa: 12_000,
        status: 'pending',
        createdAt: new Date(Date.now() - 2 * DAY),
      },
    })

    const deps = createBillingMaintenanceDeps({ organizationId: organization.id })
    const now = new Date()
    const first = await runBillingMaintenance(deps, { now })

    expect(first.graceStarted).toBe(1)
    expect(first.paymentsExpired).toBe(1)
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: organization.id },
    })
    expect(subscription.status).toBe('past_due')
    expect(subscription.graceUntil?.getTime()).toBeGreaterThan(now.getTime())
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: oldPayment.id } })).status).toBe('expired')

    const notifications = await prisma.notification.findMany({
      where: { organizationId: organization.id, dedupeKey: { startsWith: 'billing:grace-start:' } },
    })
    expect(notifications.map((row) => row.userId).sort()).toEqual([owner, billing].sort())
    expect(notifications.every((row) => row.href === BILLING_NOTIFICATION_HREF)).toBe(true)

    // Rejeu immédiat : aucune nouvelle transition ni notification.
    const second = await runBillingMaintenance(deps, { now })
    expect(second.graceStarted).toBe(0)
    expect(second.notifications).toBe(0)
    expect(
      await prisma.notification.count({
        where: { organizationId: organization.id, dedupeKey: { startsWith: 'billing:grace-start:' } },
      }),
    ).toBe(2)

    // Fin de grâce : le statut reste bloquant et rien n'est supprimé.
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { graceUntil: new Date(Date.now() - DAY) },
    })
    const third = await runBillingMaintenance(deps, { now })
    expect(third.graceEnded).toBe(1)
    const after = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: organization.id },
    })
    expect(after.status).toBe('past_due')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).coolifyAppId).toBe('app-conservee')
    expect(
      await prisma.notification.count({
        where: { organizationId: organization.id, dedupeKey: { startsWith: 'billing:grace-end:' } },
      }),
    ).toBe(2)
  }, 20_000)
})
