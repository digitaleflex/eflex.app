import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { OrganizationPanel } from '@/components/organization/organization-panel'

export const metadata = { title: 'Équipe — Eflex' }

export default async function OrganizationPage() {
  const session = await getSession()
  if (!session?.user) redirect('/login')
  return <OrganizationPanel currentUserId={session.user.id} />
}
