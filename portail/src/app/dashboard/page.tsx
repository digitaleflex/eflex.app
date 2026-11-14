import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getSession } from '@/lib/session'
import { canManageBilling, canManageProjects, resolveOrganization } from '@/lib/organizations'
import { loadDashboard } from '@/lib/dashboard-data'
import { prisma } from '@/lib/prisma'
import { billingSummary } from '@/lib/billing'
import { computeNextSteps } from '@/lib/next-steps'
import { LiveRefresh } from '@/components/live-refresh'
import { ActivityFeed, AttentionList } from '@/components/dashboard/overview'
import { DashboardOnboarding } from '@/components/dashboard/onboarding'
import { NextStepsCard } from '@/components/dashboard/next-steps-card'
import { ProjectsExplorer } from '@/components/dashboard/projects-explorer'

export const metadata = { title: 'Projets — EFLEX' }
export const dynamic = 'force-dynamic'

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

      {/* Une page, un but (Vercel) : la liste des projets. Les chiffres détaillés vivent sur Activité et
          Utilisation ; ici, une seule ligne de résumé. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Projets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {!hasProjects
              ? `Aucun projet dans ${organizationName} pour l’instant.`
              : [
                  `${data.summary.total} projet${data.summary.total > 1 ? 's' : ''}`,
                  `${data.summary.live} en ligne`,
                  data.summary.needsAttention > 0
                    ? `${data.summary.needsAttention} à regarder`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
        {hasProjects && canManage && (
          <Link
            href="/dashboard/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouveau projet
          </Link>
        )}
      </header>

      {hasProjects ? (
        <>
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
        </>
      ) : (
        <DashboardOnboarding organizationName={organizationName} canManage={canManage} />
      )}
    </div>
  )
}
