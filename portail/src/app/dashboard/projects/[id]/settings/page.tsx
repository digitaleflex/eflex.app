import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { ProjectSettings } from '@/components/project-settings'

export const dynamic = 'force-dynamic'

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params

  const org = await resolveOrganization(session)
  if (!org) notFound()
  // Un simple membre peut consulter le projet, pas le reconfigurer.
  if (!canManageProjects(org.role)) redirect(`/dashboard/projects/${id}`)

  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      name: true,
      branch: true,
      slug: true,
      domain: true,
      coolifyAppId: true,
      // Les valeurs ne quittent jamais le serveur : on n'envoie que les noms.
      envVars: { select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } },
    },
  })
  if (!project) notFound()

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
        envVars={project.envVars.map((item) => ({
          key: item.key,
          updatedAt: item.updatedAt.toISOString(),
        }))}
      />
    </div>
  )
}
