import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { AcceptInvitation } from '@/components/organization/accept-invitation'

export const metadata = { title: 'Invitation — Eflex' }

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  // Sans session, on passe par la connexion puis on revient ici.
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(`/invitations/${id}`)}`)
  return <AcceptInvitation invitationId={id} />
}
