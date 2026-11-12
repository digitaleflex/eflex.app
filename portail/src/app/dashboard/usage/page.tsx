import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { resolveOrganization } from '@/lib/organizations'
import { prisma } from '@/lib/prisma'
import { UsageView, type UsageProject } from '@/components/dashboard/usage-view'

export const metadata = { title: 'Utilisation — Eflex' }
export const dynamic = 'force-dynamic'

export default async function UsagePage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  const org = await resolveOrganization(session)
  if (!org) redirect('/dashboard/organization')

  const projects = await prisma.project.findMany({
    where: { organizationId: org.organizationId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      coolifyAppId: true,
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, coolifyAppId: true },
      },
    },
  })

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

  return <UsageView projects={items} />
}
