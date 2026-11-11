import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { ProjectSettings } from '@/components/project-settings'

export const metadata = { title: 'Paramètres du projet — Eflex' }
export const dynamic = 'force-dynamic'

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const org = await resolveOrganization(session)
  if (!org) notFound()
  // Un simple membre peut consulter le projet, pas le reconfigurer.
  if (!canManageProjects(org.role)) redirect(`/dashboard/projects/${id}`)

  const [project, transferMemberships] = await Promise.all([
    prisma.project.findFirst({
      where: { id, organizationId: org.organizationId },
      select: {
        id: true,
        name: true,
        branch: true,
        slug: true,
        domain: true,
        coolifyAppId: true,
        // Les valeurs ne quittent jamais le serveur : on n'envoie que les noms.
        envVars: { select: { key: true, updatedAt: true, appId: true }, orderBy: { key: 'asc' } },
        apps: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, root: true, domain: true, framework: true },
        },
      },
    }),
    // Organisations de destination possibles : rôles autorisés uniquement, jamais les
    // organisations où l'utilisateur n'est qu'un simple membre.
    prisma.member.findMany({
      where: {
        userId: session.user.id,
        role: { in: ['owner', 'admin'] },
        organizationId: { not: org.organizationId },
      },
      select: { organization: { select: { id: true, name: true } } },
    }),
  ])
  if (!project) notFound()

  const transferTargets = transferMemberships
    .map((membership) => membership.organization)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return (
    <div className="animate-fade-in">
      <ProjectSettings
        project={{
          id: project.id,
          name: project.name,
          branch: project.branch,
          slug: project.slug,
          domain: project.domain,
          coolifyAppId: project.coolifyAppId,
        }}
        apps={project.apps.map((app) => ({
          id: app.id,
          name: app.name,
          root: app.root,
          domain: app.domain,
          framework: app.framework,
        }))}
        transferTargets={transferTargets}
        envVars={project.envVars.map((item) => ({
          key: item.key,
          updatedAt: item.updatedAt.toISOString(),
          appId: item.appId,
        }))}
      />
    </div>
  )
}
