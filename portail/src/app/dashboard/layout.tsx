import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { THEME_ROOT_ID, themeBootScript } from '@/lib/theme'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { EventsProvider } from '@/hooks/events-provider'
import { ToastProvider } from '@/components/ui/toast'
import { NotificationToaster } from '@/components/notification-toaster'
import { MembershipWatcher } from '@/components/membership-watcher'
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

  const theme = (await cookies()).get('eflex-theme')?.value
  return (
    // Thème propre à la console : `dark` posé côté serveur si choisi, sinon par le script (mode système).
    <div id={THEME_ROOT_ID} className={`${theme === 'dark' ? 'dark ' : ''}min-h-screen bg-background text-foreground`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
    <EventsProvider scope={org?.organizationId ?? null}>
      <ToastProvider>
        <MembershipWatcher />
        <NotificationToaster />
        <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
          {children}
        </DashboardShell>
      </ToastProvider>
    </EventsProvider>
    </div>
  )
}
