'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const accept = async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await authClient.organization.acceptInvitation({ invitationId })
    if (err) {
      setLoading(false)
      return setError(authErrorMessage(err, "Impossible d'accepter l'invitation."))
    }
    if (data?.invitation.organizationId) {
      await authClient.organization.setActive({ organizationId: data.invitation.organizationId })
    }
    router.push('/dashboard')
    router.refresh()
  }

  const decline = async () => {
    setLoading(true)
    const { error: err } = await authClient.organization.rejectInvitation({ invitationId })
    if (err) {
      setLoading(false)
      return setError(authErrorMessage(err, "Impossible de refuser l'invitation."))
    }
    router.push('/dashboard')
  }

  return (
    <main id="contenu" tabIndex={-1} className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold">Invitation à rejoindre une organisation</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Vous avez été invité à rejoindre une organisation sur EFLEX. En acceptant, vous accéderez à ses
              projets selon le rôle qui vous a été attribué (lecture, gestion des projets, facturation ou
              administration).
            </p>
            <p>
              L’invitation doit être acceptée avec le compte connecté à l’adresse e-mail invitée. Si nécessaire,
              connectez-vous avec cette adresse puis rouvrez ce lien.
            </p>
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button onClick={accept} loading={loading}>
              Accepter l’invitation
            </Button>
            <Button variant="ghost" onClick={decline} disabled={loading}>
              Refuser
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
