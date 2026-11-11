import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, CreditCard, FileText, Mail, ShieldAlert, Users } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { planById, formatFcfa, formatPrice } from '@/lib/plans'
import { computeBillingState } from '@/lib/billing'
import { OrganizationAdminActions } from '@/components/admin/organization-admin-actions'
import { TimeFr } from '@/components/admin/time-fr'

export const metadata = { title: 'Organisation — Administration Eflex' }
export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  billing: 'Facturation',
  member: 'Membre',
}

const PAYMENT_LABEL: Record<string, string> = {
  pending: 'En attente',
  approved: 'Payé',
  declined: 'Refusé',
  canceled: 'Annulé',
  expired: 'Expiré',
}

const AUDIT_LABEL: Record<string, string> = {
  'organization.plan.change': 'Changement de plan',
  'organization.period.extend': 'Période prolongée',
  'organization.quota.override': 'Quota relevé',
  'organization.override.clear': 'Verrou manuel levé',
  'organization.suspend': 'Organisation suspendue',
  'organization.reactivate': 'Organisation réactivée',
  'organization.subscription': 'Abonnement modifié',
  'payment.refund': 'Paiement remboursé',
}

export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const now = new Date()

  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      suspendedAt: true,
      suspensionReason: true,
      subscription: true,
      members: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
      },
      projects: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          updatedAt: true,
          apps: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true, framework: true, domain: true },
          },
        },
      },
      invitations: {
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          plan: true,
          provider: true,
          amountFcfa: true,
          creditFcfa: true,
          status: true,
          invoiceNumber: true,
          createdAt: true,
          refundStatus: true,
        },
      },
    },
  })
  if (!organization) notFound()

  const [auditLogs, projectCount, memberCount, pendingInvitations, appCount, implicitProjectCount] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, action: true, actorEmail: true, details: true, createdAt: true },
    }),
    prisma.project.count({ where: { organizationId: organization.id } }),
    prisma.member.count({ where: { organizationId: organization.id } }),
    prisma.invitation.count({ where: { organizationId: organization.id, status: 'pending' } }),
    prisma.projectApp.count({ where: { project: { organizationId: organization.id } } }),
    prisma.project.count({ where: { organizationId: organization.id, apps: { none: {} } } }),
  ])

  const state = computeBillingState(
    {
      organizationId: organization.id,
      suspendedAt: organization.suspendedAt,
      suspensionReason: organization.suspensionReason,
      subscription: organization.subscription,
    },
    now,
  )
  const usage = { projects: projectCount, members: memberCount, apps: appCount + implicitProjectCount }
  const periodPrice = organization.subscription?.priceFcfa ?? 0

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/organizations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Toutes les organisations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            {organization.name}
          </h1>
          <Badge variant="outline">{state.plan.label}</Badge>
          {state.suspended && <Badge variant="destructive">Suspendue</Badge>}
          {state.phase === 'past_due' && (
            <Badge variant={state.blocked ? 'destructive' : 'warning'}>
              {state.blocked ? 'Impayé — bloquée' : `Impayé — grâce ${state.graceDaysLeft ?? 0} j`}
            </Badge>
          )}
          {state.phase === 'expired' && <Badge variant="warning">Période échue</Badge>}
          {state.manualOverride && <Badge variant="outline">Plan manuel</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {organization.slug} · créée le <TimeFr value={organization.createdAt} dateOnly /> ·{' '}
          {usage.members} membre{usage.members > 1 ? 's' : ''} · {usage.projects} projet{usage.projects > 1 ? 's' : ''} ·{' '}
          {pendingInvitations} invitation{pendingInvitations > 1 ? 's' : ''} en attente
        </p>
        {organization.suspendedAt && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Suspendue le <TimeFr value={organization.suspendedAt} />
              {organization.suspensionReason ? ` — motif : ${organization.suspensionReason}` : ''}. Les applications en
              ligne restent actives.
            </span>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-semibold">Abonnement et période</h2></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">Plan souscrit</dt>
              <dd className="font-medium">{state.subscribedPlan.label}</dd>
              <dt className="text-muted-foreground">Plan effectif</dt>
              <dd className="font-medium">{state.plan.label}</dd>
              <dt className="text-muted-foreground">Statut</dt>
              <dd className="font-medium">{state.phase}</dd>
              <dt className="text-muted-foreground">Prix</dt>
              <dd className="font-medium tabular-nums">{formatPrice(periodPrice)}</dd>
              <dt className="text-muted-foreground">Période jusqu’au</dt>
              <dd><TimeFr value={state.periodEnd} /></dd>
              <dt className="text-muted-foreground">Grâce jusqu’au</dt>
              <dd><TimeFr value={state.graceUntil} /></dd>
              <dt className="text-muted-foreground">Crédit prorata</dt>
              <dd className="font-medium tabular-nums">{formatFcfa(state.creditFcfa)}</dd>
              <dt className="text-muted-foreground">Verrou manuel</dt>
              <dd className="font-medium">{state.manualOverride ? 'Oui' : 'Non'}</dd>
            </dl>
            {organization.subscription?.manualOverrideReason && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Dernier motif manuel : {organization.subscription.manualOverrideReason}
              </p>
            )}
            {state.pendingPlan && (
              <p className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-foreground">
                Plan payé en attente d’arbitrage : {planById(state.pendingPlan).label}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Consommation et quotas</h2></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Usage label="Applications" value={usage.apps} limit={state.limits.projects} />
            <Usage label="Membres" value={usage.members} limit={state.limits.members} />
            <p className="text-xs text-muted-foreground">
              Projets réels : <span className="font-medium tabular-nums">{usage.projects}</span>. Domaines personnalisés :{' '}
              <span className="tabular-nums">{state.limits.customDomains}</span> par projet (non consommés ici).
            </p>
            {(organization.subscription?.projectLimitOverride != null || organization.subscription?.memberLimitOverride != null) && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Quota dérogatoire actif
                {organization.subscription?.quotaOverrideUntil
                  ? ` jusqu’au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(organization.subscription.quotaOverrideUntil)}`
                  : ''}
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">Actions d’administration</h2></CardHeader>
        <CardContent>
          <OrganizationAdminActions
            organizationId={organization.id}
            plan={organization.subscription?.plan ?? 'free'}
            status={organization.subscription?.status ?? 'free'}
            suspended={state.suspended}
            reason={organization.suspensionReason}
            manualOverride={state.manualOverride}
            projectLimitOverride={organization.subscription?.projectLimitOverride ?? null}
            memberLimitOverride={organization.subscription?.memberLimitOverride ?? null}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Membres et rôles ({organization.members.length})
            </h2>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {organization.members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{member.user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{member.user.email}</span>
                  </span>
                  <Badge variant={member.role === 'owner' ? 'default' : 'outline'}>
                    {ROLE_LABEL[member.role] ?? member.role}
                  </Badge>
                </li>
              ))}
            </ul>
            {organization.invitations.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  Invitations en attente
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {organization.invitations.map((invitation) => (
                    <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="truncate">{invitation.email}</span>
                      <span className="text-muted-foreground">
                        {ROLE_LABEL[invitation.role ?? 'member'] ?? invitation.role} · expire le <TimeFr value={invitation.expiresAt} dateOnly />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Projets ({organization.projects.length})</h2></CardHeader>
          <CardContent>
            {organization.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun projet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {organization.projects.map((project) => {
                  const primary = project.apps
                    .slice()
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0] ?? null
                  return (
                    <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <Link href={`/admin/projects/${project.id}`} className="min-w-0 font-medium hover:underline">
                        <span className="block truncate">{project.name}</span>
                        <span className="block truncate text-xs font-normal text-muted-foreground">
                          {primary?.framework ?? '—'} · {primary?.domain ?? 'sans domaine'}
                          {project.apps.length > 1 ? ` · ${project.apps.length} applications` : ''}
                        </span>
                      </Link>
                      <TimeFr value={project.updatedAt} className="text-xs text-muted-foreground" />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold">
              <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Paiements et factures
            </h2>
          </CardHeader>
          <CardContent>
            {organization.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement.</p>
            ) : (
              <ul className="divide-y divide-border">
                {organization.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {planById(payment.plan).label} · <span className="tabular-nums">{formatFcfa(payment.amountFcfa)}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {payment.provider} · <TimeFr value={payment.createdAt} />
                        {payment.creditFcfa > 0 && ` · crédit ${formatFcfa(payment.creditFcfa)}`}
                        {payment.refundStatus === 'refunded' && ' · remboursé'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={payment.status === 'approved' ? 'success' : payment.status === 'pending' ? 'warning' : 'outline'}>
                        {PAYMENT_LABEL[payment.status] ?? payment.status}
                      </Badge>
                      {payment.status === 'approved' && (
                        <a href={`/api/billing/invoices/${payment.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />PDF
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Journal d’activité récent</h2></CardHeader>
          <CardContent>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune entrée d’audit.</p>
            ) : (
              <ul className="divide-y divide-border">
                {auditLogs.map((entry) => (
                  <li key={entry.id} className="py-2 text-sm">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{AUDIT_LABEL[entry.action] ?? entry.action}</span>
                      <TimeFr value={entry.createdAt} className="text-xs text-muted-foreground" />
                    </p>
                    <p className="text-xs text-muted-foreground">{entry.actorEmail}</p>
                    {typeof entry.details === 'object' && entry.details !== null && 'reason' in entry.details && (
                      <p className="mt-1 text-xs text-muted-foreground">Motif : {String((entry.details as Record<string, unknown>).reason)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Usage({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percent = Math.min(100, Math.round((value / Math.max(1, limit)) * 100))
  const full = value >= limit
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className={full ? 'font-medium text-warning tabular-nums' : 'font-medium tabular-nums'}>
          {value} / {limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
        <div className={full ? 'h-full rounded-full bg-warning' : 'h-full rounded-full bg-primary'} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
