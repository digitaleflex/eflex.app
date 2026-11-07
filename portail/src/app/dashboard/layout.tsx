import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { DashboardShell } from '@/components/dashboard-shell'

// Protection côté serveur : aucune page du tableau de bord n'est rendue sans session.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  // À l'inscription, la session est ouverte avant la création de l'organisation personnelle :
  // on fixe l'organisation active ici, une fois pour toutes, pour que le sélecteur et l'API s'accordent.
  const org = await resolveOrganization(session)
  if (org && session.session.activeOrganizationId !== org.organizationId) {
    await prisma.session.update({ where: { id: session.session.id }, data: { activeOrganizationId: org.organizationId } })
  }

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </DashboardShell>
  )
}
