import { requireAdminPage } from '@/lib/admin'
import { EventsProvider } from '@/hooks/events-provider'
import { LiveRefresh } from '@/components/live-refresh'
import { AdminShell } from '@/components/admin/admin-shell'

export const metadata = { title: 'Administration — EFLEX', robots: { index: false, follow: false } }
// Données sensibles et propres à chaque session : jamais en cache.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage()
  return (
    <EventsProvider>
      {/* Temps réel : chaque action d'administration rafraîchit la page affichée. */}
      <LiveRefresh types={['audit.entry']} />
      <AdminShell email={session.user.email}>{children}</AdminShell>
    </EventsProvider>
  )
}
