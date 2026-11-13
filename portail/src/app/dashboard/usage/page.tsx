import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { resolveOrganization } from '@/lib/organizations'
import { prisma } from '@/lib/prisma'
import { loadBillingState } from '@/lib/billing'
import { UsageView, type UsageProject, type UsageQuotaSummary } from '@/components/dashboard/usage-view'

export const metadata = { title: 'Utilisation — Eflex' }
export const dynamic = 'force-dynamic'

export default async function UsagePage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const org = await resolveOrganization(session)
  if (!org) redirect('/dashboard/organization')

  const [projects, billing, members, appsCount, implicitProjects, domainsCount] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: org.organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        coolifyAppId: true,
        _count: { select: { domains: true } },
        apps: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, coolifyAppId: true },
        },
      },
    }),
    loadBillingState(org.organizationId),
    prisma.member.count({ where: { organizationId: org.organizationId } }),
    prisma.projectApp.count({ where: { project: { organizationId: org.organizationId } } }),
    prisma.project.count({ where: { organizationId: org.organizationId, apps: { none: {} } } }),
    prisma.projectDomain.count({ where: { project: { organizationId: org.organizationId } } }),
  ])

  const items: UsageProject[] = projects.map((project) => {
    if (project.apps.length > 0) {
      return {
        id: project.id,
        name: project.name,
        apps: project.apps.map((app) => ({
          id: app.id,
          name: app.name,
          deployed: Boolean(app.coolifyAppId),
        })),
      }
    }
    return {
      id: project.id,
      name: project.name,
      apps: [{ id: '', name: 'Application', deployed: Boolean(project.coolifyAppId) }],
    }
  })

  const maxDomainsInProject = projects.reduce((max, p) => Math.max(max, p._count.domains), 0)

  const quota: UsageQuotaSummary = {
    planLabel: billing.plan.label,
    phase: billing.phase,
    apps: { used: appsCount + implicitProjects, limit: billing.limits.projects },
    members: { used: members, limit: billing.limits.members },
    customDomains: {
      used: domainsCount,
      maxPerProject: maxDomainsInProject,
      limitPerProject: billing.limits.customDomains,
    },
  }

  return <UsageView projects={items} quota={quota} />
}
