import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { canManageBilling, canManageProjects, resolveOrganization } from '@/lib/organizations'
import { loadDashboard } from '@/lib/dashboard-data'
import { prisma } from '@/lib/prisma'
import { billingSummary } from '@/lib/billing'
import { computeNextSteps } from '@/lib/next-steps'
import { LiveRefresh } from '@/components/live-refresh'
import { ActivityFeed, AttentionList, OverviewStrip } from '@/components/dashboard/overview'
import { DashboardOnboarding } from '@/components/dashboard/onboarding'
import { NextStepsCard } from '@/components/dashboard/next-steps-card'
import { UsageTile } from '@/components/dashboard/usage-tile'
import { ProjectsExplorer } from '@/components/dashboard/projects-explorer'

export const metadata = { title: 'Projets — Eflex' }
export const dynamic = 'force-dynamic'

function greeting(date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(date))
  return hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour'
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const org = await resolveOrganization(session)
  if (!org) redirect('/dashboard/organization')

  const canManage = canManageProjects(org.role)
  const billing = canManageBilling(org.role)
    ? await billingSummary(org.organizationId).catch(() => null)
    : null

  const quota = billing ? { used: billing.usage.apps, limit: billing.limits.projects } : null
  const [data, organization, memberCount, envCount, verifiedDomainCount, liveDeployCount] = await Promise.all([
    loadDashboard(org.organizationId, new Date(), { quota }),
    prisma.organization.findUnique({ where: { id: org.organizationId }, select: { name: true } }),
    prisma.member.count({ where: { organizationId: org.organizationId } }),
    prisma.envVar.count({ where: { project: { organizationId: org.organizationId } } }),
    prisma.projectDomain.count({ where: { project: { organizationId: org.organizationId }, verifiedAt: { not: null } } }),
    prisma.deployment.count({ where: { project: { organizationId: org.organizationId }, status: 'live' } }),
  ])
  const firstName = session.user.name.split(' ')[0]
  const organizationName = organization?.name ?? 'cette organisation'
  const hasProjects = data.summary.total > 0

  const hasVerifiedDomain = verifiedDomainCount > 0 || data.projects.some((p) => p.tlsValid === true && p.domain)
  const nextSteps = hasProjects
    ? computeNextSteps({
        hasVerifiedDomain,
        hasEnvVars: envCount > 0,
        memberCount,
        hasSuccessfulDeploy: liveDeployCount > 0,
        canManage,
      })
    : []

  return (
    <div className="space-y-6">
      {/* Temps réel : toute création ou changement de statut recharge ces données côté serveur. */}
      {/* 1,5 s : un déploiement enchaîne une dizaine de changements d'état ; chaque rafraîchissement relance
          les requêtes du tableau de bord, donc on regroupe les rafales plus largement que le défaut (0,4 s). */}
      <LiveRefresh
        types={['project.created', 'project.updated', 'project.deleted', 'project.transferred', 'deployment.created', 'deployment.status']}
        delayMs={1500}
      />

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-balance">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {!hasProjects
            ? `Aucun projet dans ${organizationName} pour l’instant.`
            : data.summary.needsAttention > 0
              ? `${data.summary.needsAttention} élément${data.summary.needsAttention > 1 ? 's demandent' : ' demande'} votre attention dans ${organizationName}.`
              : `Tous les projets de ${organizationName} sont en ordre.`}
        </p>
      </header>

      {hasProjects ? (
        <>
          <OverviewStrip data={data} />
          <AttentionList items={data.attention} />

          {/* `grid-cols-1` (= minmax(0, 1fr)) sous 2xl : sans définition de colonne, la piste implicite est
              `auto` et les enfants prennent la largeur minimale de leur contenu, ce qui fait déborder la
              page sur téléphone et tablette (41 px à 360 px, 96 px à 768 px en CI). */}
          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            <ProjectsExplorer
              projects={data.projects}
              canManage={canManage}
              initialSort={data.summary.needsAttention > 0 ? 'status' : 'recent'}
            />
            <aside className="2xl:sticky 2xl:top-28 2xl:self-start">
              <ActivityFeed items={data.activity.slice(0, 8)} />
            </aside>
          </div>

          {/* L'action principale (les projets) vient avant l'aide à la mise en route et le résumé d'usage. */}
          {nextSteps.length > 0 && <NextStepsCard steps={nextSteps} />}
          <UsageTile />
        </>
      ) : (
        <DashboardOnboarding organizationName={organizationName} canManage={canManage} />
      )}
    </div>
  )
}
