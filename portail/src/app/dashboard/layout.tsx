import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { DashboardShell } from '@/components/dashboard-shell'

// Protection côté serveur : aucune page du tableau de bord n'est rendue sans session.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </DashboardShell>
  )
}
