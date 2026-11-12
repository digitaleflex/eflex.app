import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageBilling, resolveOrganization } from '@/lib/organizations'
import { EventsProvider } from '@/hooks/events-provider'
import { ToastProvider } from '@/components/ui/toast'
import { NotificationToaster } from '@/components/notification-toaster'
import { MembershipWatcher } from '@/components/membership-watcher'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { DashboardShell } from '@/components/dashboard-shell'
import { billingSummary } from '@/lib/billing'

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

  let billing: Awaited<ReturnType<typeof billingSummary>> | null = null
  if (org && canManageBilling(org.role)) {
    try {
      billing = await billingSummary(org.organizationId)
    } catch {
      billing = null
    }
  }

  return (
    // Le thème est porté par <html> (cookie ou système), commun à tout le site.
    <div className="min-h-screen bg-background text-foreground">
    <EventsProvider>
      <ToastProvider>
        <MembershipWatcher />
        <NotificationToaster />
        <DashboardShell
          user={{ name: session.user.name, email: session.user.email }}
          billing={billing}
        >
          {session.session.impersonatedBy && <ImpersonationBanner userName={session.user.name} />}
          {children}
        </DashboardShell>
      </ToastProvider>
    </EventsProvider>
    </div>
  )
}
