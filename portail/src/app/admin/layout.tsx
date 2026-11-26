import { requireAdminPage } from '@/lib/admin'
import { adminPermissions, type AdminPermission } from '@/lib/admin-rbac'
import { EventsProvider } from '@/hooks/events-provider'
import { LiveRefresh } from '@/components/live-refresh'
import { AdminShell } from '@/components/admin/admin-shell'

export const metadata = { title: 'Administration', robots: { index: false, follow: false } }
// Données sensibles et propres à chaque session : jamais en cache.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage()
  const role = (session.user as { role?: string | null }).role
  const permissions = adminPermissions(role)
  return (
    <EventsProvider>
      {/* Temps réel : chaque action d'administration rafraîchit la page affichée. */}
      <LiveRefresh types={['audit.entry']} />
      <AdminShell email={session.user.email} permissions={permissions as AdminPermission[]}>
        {children}
      </AdminShell>
    </EventsProvider>
  )
}
