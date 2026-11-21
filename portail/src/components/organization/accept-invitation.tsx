'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { ORGANIZATION_ROLE_DESCRIPTION, organizationRoleLabel } from '@/lib/organizations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

type InvitationInfo = {
  organizationName: string
  role: string
  email: string
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState<InvitationInfo | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const getInvitation = (
          authClient.organization as unknown as {
            getInvitation?: (args: { query: { id: string } }) => Promise<{ data?: unknown }>
          }
        ).getInvitation
        if (!getInvitation) return
        const { data } = await getInvitation({ query: { id: invitationId } })
        if (!active || !data) return
        const record = data as Record<string, unknown>
        const org = (record.organization ?? {}) as Record<string, unknown>
        setInfo({
          organizationName: readString(org.name) ?? 'une organisation EFLEX',
          role: readString(record.role) ?? 'member',
          email: readString(record.email) ?? '',
        })
      } catch {
        // Fallback : l'écran reste utilisable sans détails si l'invitation ne peut pas être lue.
      }
    })()
    return () => {
      active = false
    }
  }, [invitationId])

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

  const roleLabel = organizationRoleLabel(info?.role ?? 'member')
  const roleDescription =
    ORGANIZATION_ROLE_DESCRIPTION[(info?.role ?? 'member') as keyof typeof ORGANIZATION_ROLE_DESCRIPTION]

  return (
    <main id="contenu" tabIndex={-1} className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold">Invitation à rejoindre une organisation</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Vous êtes invité à rejoindre{' '}
              <span className="font-medium text-foreground">{info?.organizationName ?? 'une organisation EFLEX'}</span>
              {info?.email ? (
                <>
                  {' '}avec l’adresse <span className="font-medium text-foreground">{info.email}</span>
                </>
              ) : null}
              .
            </p>
            <p>
              Rôle proposé : <span className="font-medium text-foreground">{roleLabel}</span>.
              {roleDescription ? ` ${roleDescription}` : ''}
            </p>
            <p>
              En acceptant, vous aurez accès aux ressources de l’organisation selon ce rôle. L’invitation doit être
              acceptée avec le compte connecté à l’adresse invitée.
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
