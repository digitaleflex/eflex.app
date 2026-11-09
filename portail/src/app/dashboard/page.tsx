import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { resolveOrganization } from '@/lib/organizations'
import { loadDashboard } from '@/lib/dashboard-data'
import { prisma } from '@/lib/prisma'
import { LiveRefresh } from '@/components/live-refresh'
import { ActivityFeed, AttentionList, OverviewStrip } from '@/components/dashboard/overview'
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

  const [data, organization] = await Promise.all([
    loadDashboard(org.organizationId),
    prisma.organization.findUnique({ where: { id: org.organizationId }, select: { name: true } }),
  ])
  const firstName = session.user.name.split(' ')[0]

  return (
    <div className="space-y-6">
      {/* Temps réel : toute création ou changement de statut recharge ces données côté serveur. */}
      <LiveRefresh types={['project.created', 'project.updated', 'project.deleted', 'deployment.created', 'deployment.status']} />

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-balance">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.summary.total === 0
            ? `Aucun projet dans ${organization?.name ?? 'cette organisation'} pour l’instant.`
            : data.summary.needsAttention > 0
              ? `${data.summary.needsAttention} projet${data.summary.needsAttention > 1 ? 's demandent' : ' demande'} votre attention dans ${organization?.name}.`
              : `Tous les projets de ${organization?.name} sont en ordre.`}
        </p>
      </header>

      {data.summary.total > 0 && <OverviewStrip data={data} />}
      <AttentionList items={data.attention} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ProjectsExplorer projects={data.projects} />
        {data.summary.total > 0 && (
          <aside className="xl:sticky xl:top-28 xl:self-start">
            <ActivityFeed items={data.activity.slice(0, 8)} />
          </aside>
        )}
      </div>
    </div>
  )
}
