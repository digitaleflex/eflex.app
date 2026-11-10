import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Aucun e-mail réel dans les tests : la vérification d'adresse resterait
// exigée pour accepter une invitation, ce qui n'est pas le sujet ici.
process.env.RESEND_API_KEY = ''
delete process.env.RESEND_API_KEY

// Intégration : EFLEX_TEST_DB=1 + base PostgreSQL migrée (DATABASE_URL).
const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

const PASSWORD = 'motdepasse-solide'
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

function email(name: string): string {
  return `${name}-${stamp}@exemple.fr`
}

async function createUserWithOrganization(name: string) {
  const { prisma } = await import('@/lib/prisma')
  const user = await prisma.user.create({ data: { name, email: email(name) } })
  const organization = await prisma.organization.create({
    data: {
      name: `Org ${name}`,
      slug: `org-${name}-${stamp}`.toLowerCase(),
      members: { create: { userId: user.id, role: 'owner' } },
    },
  })
  return { prisma, user, organization }
}

run('cycle de vie de la facturation', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  // Aucun e-mail réel : les invitations restent acceptables sans vérification.
  delete process.env.RESEND_API_KEY

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  it('un impayé ouvre une grâce de 7 jours, puis bloque les nouveaux déploiements sans supprimer le projet', async () => {
    const { prisma, user, organization } = await createUserWithOrganization('grâce')
    const { markPaymentFailed, activatePayment } = await import('@/lib/payments')
    const { assertDeploymentAllowed, loadBillingState } = await import('@/lib/billing')
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')

    const periodEnd = new Date(Date.now() + 20 * 86_400_000)
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
        userId: user.id,
        name: 'Projet en production',
        slug: `prod-${stamp}`,
        repoUrl: 'https://github.com/exemple/projet',
        framework: 'node',
      },
    })
    const payment = await prisma.payment.create({
      data: {
        reference: `ref-${stamp}-grace`,
        organizationId: organization.id,
        userId: user.id,
        plan: 'starter',
        provider: 'kkiapay',
        amountFcfa: 12_000,
        status: 'pending',
      },
    })

    await markPaymentFailed(payment.id, 'declined')
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(subscription.status).toBe('past_due')
    expect(subscription.graceUntil?.toISOString()).toBe(new Date(periodEnd.getTime() + 7 * 86_400_000).toISOString())

    // Pendant la grâce : toujours autorisé.
    expect((await assertDeploymentAllowed(organization.id)).ok).toBe(true)

    // Grâce dépassée : blocage des déploiements, projet intact.
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { graceUntil: new Date(Date.now() - 86_400_000) },
    })
    const state = await loadBillingState(organization.id)
    expect(state.blocked).toBe(true)
    expect(state.blockCode).toBe('payment_past_due')
    const guard = await assertDeploymentAllowed(organization.id)
    expect(guard.ok).toBe(false)

    const queued = await enqueueProjectDeployment(project)
    expect('error' in queued && queued.code).toBe('payment_past_due')
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(1)
    expect(await prisma.deployment.count({ where: { projectId: project.id } })).toBe(0)

    // Régularisation : le paiement remet l'abonnement actif et efface la grâce.
    const regularized = await prisma.payment.create({
      data: {
        reference: `ref-${stamp}-regular`,
        organizationId: organization.id,
        userId: user.id,
        plan: 'starter',
        provider: 'kkiapay',
        amountFcfa: 12_000,
        status: 'pending',
      },
    })
    await activatePayment(regularized.id, `tx-${stamp}`)
    const active = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(active.status).toBe('active')
    expect(active.graceUntil).toBeNull()
    expect((await assertDeploymentAllowed(organization.id)).ok).toBe(true)
  })

  it('un paiement pour un autre plan n’écrase pas un changement manuel (pendingPlan + crédit)', async () => {
    const { prisma, user, organization } = await createUserWithOrganization('manuel')
    const { activatePayment } = await import('@/lib/payments')

    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        plan: 'pro',
        status: 'active',
        priceFcfa: 29_000,
        currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
        manualOverride: true,
        manualOverrideAt: new Date(),
        manualOverrideBy: 'admin@exemple.fr',
        manualOverrideReason: 'Geste commercial',
        creditFcfa: 0,
      },
    })
    const payment = await prisma.payment.create({
      data: {
        reference: `ref-${stamp}-manuel`,
        organizationId: organization.id,
        userId: user.id,
        plan: 'starter',
        provider: 'kkiapay',
        amountFcfa: 12_000,
        status: 'pending',
      },
    })

    const result = await activatePayment(payment.id, `tx-${stamp}-manuel`)
    expect('ok' in result).toBe(true)
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(subscription.plan).toBe('pro')
    expect(subscription.pendingPlan).toBe('starter')
    expect(subscription.creditFcfa).toBe(12_000)
    expect(subscription.manualOverride).toBe(true)
  })

  it('active un paiement de renouvellement une seule fois (idempotence)', async () => {
    const { prisma, user, organization } = await createUserWithOrganization('idempotent')
    const { activatePayment } = await import('@/lib/payments')

    const periodEnd = new Date(Date.now() + 10 * 86_400_000)
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        plan: 'starter',
        status: 'past_due',
        priceFcfa: 12_000,
        currentPeriodEnd: periodEnd,
        graceUntil: new Date(Date.now() + 3 * 86_400_000),
      },
    })
    const payment = await prisma.payment.create({
      data: {
        reference: `ref-${stamp}-idem`,
        organizationId: organization.id,
        userId: user.id,
        plan: 'starter',
        provider: 'kkiapay',
        amountFcfa: 12_000,
        status: 'pending',
      },
    })

    await activatePayment(payment.id, `tx-${stamp}-idem`)
    const first = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(first.status).toBe('active')
    expect(first.currentPeriodEnd?.toISOString()).toBe(new Date(periodEnd.getTime() + 30 * 86_400_000).toISOString())

    // Rejeu du webhook : aucun second allongement.
    await activatePayment(payment.id, `tx-${stamp}-idem`)
    const second = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(second.currentPeriodEnd?.toISOString()).toBe(first.currentPeriodEnd?.toISOString())
    expect(second.manualOverride).toBe(false)
  })

  it('une organisation suspendue bloque créations et déploiements mais conserve projets et applications', async () => {
    const { prisma, user, organization } = await createUserWithOrganization('suspendue')
    const { assertDeploymentAllowed } = await import('@/lib/billing')
    const { enqueueProjectDeployment } = await import('@/lib/project-deployments')

    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Application en ligne',
        slug: `en-ligne-${stamp}`,
        repoUrl: 'https://github.com/exemple/en-ligne',
        framework: 'nextjs',
        coolifyAppId: 'app-123',
        domain: 'en-ligne.eflex.app',
      },
    })
    await prisma.organization.update({
      where: { id: organization.id },
      data: { suspendedAt: new Date(), suspensionReason: 'Impayé chronique' },
    })

    const guard = await assertDeploymentAllowed(organization.id)
    expect(guard.ok).toBe(false)
    if (!guard.ok) expect(guard.code).toBe('organization_suspended')

    const queued = await enqueueProjectDeployment(project)
    expect('error' in queued && queued.code).toBe('organization_suspended')
    const kept = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(kept.coolifyAppId).toBe('app-123')
    expect(kept.domain).toBe('en-ligne.eflex.app')
  })

  it('refuse un projet au-delà du quota du plan gratuit, avec un message d’incitation', async () => {
    const { prisma, user, organization } = await createUserWithOrganization('quota-projets')
    const { assertProjectQuota } = await import('@/lib/billing')

    for (let index = 0; index < 4; index += 1) {
      await prisma.project.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          name: `Projet ${index}`,
          slug: `quota-${index}-${stamp}`,
          repoUrl: 'https://github.com/exemple/quota',
          framework: 'static',
        },
      })
    }
    // 4 projets sur 5 : le suivant est encore autorisé.
    expect((await assertProjectQuota(organization.id)).ok).toBe(true)
    await prisma.project.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        name: 'Projet 5',
        slug: `quota-5-${stamp}`,
        repoUrl: 'https://github.com/exemple/quota',
        framework: 'static',
      },
    })
    const quota = await assertProjectQuota(organization.id)
    expect('error' in quota).toBe(true)
    if ('error' in quota) {
      expect(quota.error).toContain('5 projets')
      expect(quota.error).toContain('plan supérieur')
    }
  })

  it('le rôle billing accède à la facturation mais pas aux journaux', async () => {
    const { prisma, user, organization } = await createUserWithOrganization('billing-role')
    const billingUser = await prisma.user.create({ data: { name: 'Facturation', email: email('billing') } })
    await prisma.member.create({ data: { organizationId: organization.id, userId: billingUser.id, role: 'billing' } })
    currentSession = {
      user: { id: billingUser.id, email: billingUser.email, role: 'user', banned: false },
      session: { activeOrganizationId: organization.id },
    }

    const { GET: summaryGET } = await import('@/app/api/billing/summary/route')
    const summary = await summaryGET()
    expect(summary.status).toBe(200)
    expect(((await summary.json()) as { canManage: boolean }).canManage).toBe(true)

    const { GET: logsGET } = await import('@/app/api/projects/[id]/deployments/[deploymentId]/logs/route')
    const logs = await logsGET(new Request('http://localhost/api/x'), {
      params: Promise.resolve({ id: 'projet', deploymentId: 'deploiement' }),
    })
    expect(logs.status).toBe(403)
    expect(user.id).toBeTruthy()
  })

  it('refuse l’invitation au-delà du quota de membres et l’acceptation d’une invitation en attente', async () => {
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    const { canManageBilling } = await import('@/lib/organizations')

    const ownerEmail = email('owner-quota')
    const owner = await auth.api.signUpEmail({ body: { name: 'Owner quota', email: ownerEmail, password: PASSWORD } })
    await prisma.user.update({ where: { id: owner.user.id }, data: { emailVerified: true } })
    const ownerMember = await prisma.member.findFirstOrThrow({ where: { userId: owner.user.id } })
    const organizationId = ownerMember.organizationId
    const login = await auth.api.signInEmail({ body: { email: ownerEmail, password: PASSWORD }, returnHeaders: true })
    const headers = new Headers({
      cookie: login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
    })

    // Plan gratuit : 5 membres. Le propriétaire + 4 membres créés directement.
    for (let index = 0; index < 4; index += 1) {
      const user = await prisma.user.create({ data: { name: `Membre ${index}`, email: email(`membre-${index}`) } })
      await prisma.member.create({ data: { organizationId, userId: user.id, role: 'member' } })
    }
    const sixthEmail = email('sixieme')
    await expect(
      auth.api.createInvitation({ headers, body: { email: sixthEmail, role: 'member', organizationId } }),
    ).rejects.toThrow(/limité à 5 membres/)

    // Invitation créée avant la limite (simulée en base) : l'acceptation est refusée.
    const lateEmail = email('tardif')
    const late = await auth.api.signUpEmail({ body: { name: 'Tardif', email: lateEmail, password: PASSWORD } })
    // Adresse vérifiée : on teste le quota, pas la vérification d'e-mail.
    await prisma.user.update({ where: { id: late.user.id }, data: { emailVerified: true } })
    const invitation = await prisma.invitation.create({
      data: {
        organizationId,
        email: lateEmail,
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: owner.user.id,
      },
    })
    const lateLogin = await auth.api.signInEmail({ body: { email: lateEmail, password: PASSWORD }, returnHeaders: true })
    const lateHeaders = new Headers({
      cookie: lateLogin.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
    })
    await expect(
      auth.api.acceptInvitation({ headers: lateHeaders, body: { invitationId: invitation.id } }),
    ).rejects.toThrow(/limité à 5 membres/)
    expect(await prisma.member.count({ where: { organizationId } })).toBe(5)
    expect(late.user.id).toBeTruthy()
    expect(canManageBilling('billing')).toBe(true)
    expect(canManageBilling('member')).toBe(false)
  }, 15_000)
})

run('actions d’administration sur les organisations', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.ADMIN_EMAILS ??= 'admin-test@exemple.fr'

  beforeAll(() => {
    currentSession = {
      user: { id: 'admin-test-id', email: 'admin-test@exemple.fr', role: 'admin', banned: false },
      session: { id: 'session-test' },
    }
  })

  afterAll(async () => {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  })

  const call = (path: string, body: unknown) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('change le plan avec motif, crédite le prorata et écrit l’audit', async () => {
    const { prisma, organization } = await createUserWithOrganization('admin-plan')
    const { POST } = await import('@/app/api/admin/organizations/[id]/subscription/route')

    const periodEnd = new Date(Date.now() + 15 * 86_400_000)
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        plan: 'starter',
        status: 'active',
        priceFcfa: 12_000,
        currentPeriodEnd: periodEnd,
      },
    })
    const ctx = { params: Promise.resolve({ id: organization.id }) }

    const withoutReason = await POST(call(`/x`, { action: 'plan', plan: 'pro', status: 'active' }), ctx)
    expect(withoutReason.status).toBe(400)

    const response = await POST(
      call(`/x`, { action: 'plan', plan: 'pro', status: 'active', reason: 'Virement reçu hors plateforme' }),
      ctx,
    )
    expect(response.status).toBe(200)

    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(subscription.plan).toBe('pro')
    expect(subscription.status).toBe('active')
    expect(subscription.manualOverride).toBe(true)
    expect(subscription.creditFcfa).toBe(6_000)
    expect(subscription.currentPeriodEnd?.toISOString()).toBe(periodEnd.toISOString())

    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'organization.plan.change', targetId: organization.id },
    })
    expect(JSON.stringify(auditEntry.details)).toContain('Virement reçu hors plateforme')
  })

  it('suspend puis réactive une organisation, avec audit', async () => {
    const { prisma, organization } = await createUserWithOrganization('admin-suspend')
    const { POST } = await import('@/app/api/admin/organizations/[id]/suspension/route')
    const { assertDeploymentAllowed } = await import('@/lib/billing')
    const ctx = { params: Promise.resolve({ id: organization.id }) }

    const noReason = await POST(call('/x', { suspended: true, reason: '' }), ctx)
    expect(noReason.status).toBe(400)

    const suspended = await POST(call('/x', { suspended: true, reason: 'Fraude signalée' }), ctx)
    expect(suspended.status).toBe(200)
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } })).suspendedAt).not.toBeNull()
    expect((await assertDeploymentAllowed(organization.id)).ok).toBe(false)

    const reactivated = await POST(call('/x', { suspended: false, reason: 'Litige résolu' }), ctx)
    expect(reactivated.status).toBe(200)
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } })).suspendedAt).toBeNull()
    expect((await assertDeploymentAllowed(organization.id)).ok).toBe(true)

    expect(await prisma.auditLog.count({ where: { action: 'organization.suspend', targetId: organization.id } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { action: 'organization.reactivate', targetId: organization.id } })).toBe(1)
  })

  it('prolonge la période et relève temporairement un quota', async () => {
    const { prisma, organization } = await createUserWithOrganization('admin-extend')
    const { POST } = await import('@/app/api/admin/organizations/[id]/subscription/route')
    const ctx = { params: Promise.resolve({ id: organization.id }) }

    const periodEnd = new Date(Date.now() + 5 * 86_400_000)
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        plan: 'free',
        status: 'trialing',
        priceFcfa: 0,
        currentPeriodEnd: periodEnd,
      },
    })

    expect(
      (await POST(call('/x', { action: 'extend', days: 10, reason: 'Essai prolongé' }), ctx)).status,
    ).toBe(200)
    let subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(subscription.status).toBe('trialing')
    expect(subscription.currentPeriodEnd?.toISOString()).toBe(new Date(periodEnd.getTime() + 10 * 86_400_000).toISOString())

    expect(
      (
        await POST(
          call('/x', {
            action: 'quota',
            projectLimit: 25,
            memberLimit: 12,
            until: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            reason: 'Migration client',
          }),
          ctx,
        )
      ).status,
    ).toBe(200)
    subscription = await prisma.subscription.findUniqueOrThrow({ where: { organizationId: organization.id } })
    expect(subscription.projectLimitOverride).toBe(25)
    expect(subscription.memberLimitOverride).toBe(12)

    const { loadBillingState } = await import('@/lib/billing')
    const state = await loadBillingState(organization.id)
    expect(state.limits.projects).toBe(25)
    expect(state.limits.members).toBe(12)
  })
})
