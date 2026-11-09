'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, LogOut, Trash2, UserPlus } from 'lucide-react'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { slugify } from '@/lib/slug'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useEvents } from '@/hooks/events-provider'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const ROLE_LABEL: Record<string, string> = { owner: 'Propriétaire', admin: 'Administrateur', member: 'Membre' }
const roleLabel = (role: string) => ROLE_LABEL[role] ?? role

type InviteRole = 'admin' | 'member'

export function OrganizationPanel({ currentUserId }: { currentUserId: string }) {
  const router = useRouter()
  const { data: org, isPending, refetch } = authClient.useActiveOrganization()
  // Temps réel : un autre onglet ou une autre personne modifie l'équipe ou les invitations.
  useEvents(['member.added', 'member.removed', 'member.updated', 'invitation.created', 'invitation.updated'], () => void refetch())
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<null | { kind: 'remove'; memberId: string; name: string } | { kind: 'leave' }>(null)

  const fail = (error: Parameters<typeof authErrorMessage>[0]) => setMessage({ kind: 'error', text: authErrorMessage(error) })
  const ok = (text: string) => setMessage({ kind: 'ok', text })

  if (isPending) return <p className="text-sm text-muted-foreground">Chargement de l&apos;organisation…</p>

  const me = org?.members.find((m) => m.userId === currentUserId)
  const myRole = me?.role ?? 'member'
  const canInvite = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Équipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les projets appartiennent à une organisation : tous ses membres les voient, selon leur rôle.
        </p>
      </div>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive' : 'rounded-lg border border-border bg-muted/50 p-3 text-sm'}>
          {message.text}
        </p>
      )}

      {org && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{org.name}</h2>
                <Badge variant="outline">Votre rôle : {roleLabel(myRole)}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {canInvite ? (
                <RenameForm key={org.id} orgId={org.id} name={org.name} onDone={() => { ok('Organisation mise à jour.'); void refetch() }} onError={fail} />
              ) : (
                <p className="text-sm text-muted-foreground">Seuls les propriétaires et administrateurs peuvent modifier l&apos;organisation.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="font-semibold">Membres ({org.members.length})</h2></CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {org.members.map((member) => {
                  const self = member.userId === currentUserId
                  const editable = canInvite && !self && (isOwner || member.role === 'member')
                  return (
                    <li key={member.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.user.name}{self && ' (vous)'}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {editable ? (
                          <>
                            <label className="sr-only" htmlFor={`role-${member.id}`}>Rôle de {member.user.name}</label>
                            <select
                              id={`role-${member.id}`}
                              value={member.role}
                              onChange={async (e) => {
                                const { error } = await authClient.organization.updateMemberRole({ memberId: member.id, role: e.target.value as 'owner' | 'admin' | 'member', organizationId: org.id })
                                if (error) fail(error)
                                else { ok('Rôle mis à jour.'); void refetch() }
                              }}
                              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                            >
                              {isOwner && <option value="owner">Propriétaire</option>}
                              <option value="admin">Administrateur</option>
                              <option value="member">Membre</option>
                            </select>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Retirer ${member.user.name}`}
                              onClick={() => setConfirm({ kind: 'remove', memberId: member.id, name: member.user.name })}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </>
                        ) : (
                          <Badge variant="outline">{roleLabel(member.role)}</Badge>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          {canInvite && (
            <Card>
              <CardHeader><h2 className="font-semibold">Inviter</h2></CardHeader>
              <CardContent className="space-y-4">
                <InviteForm key={org.id} orgId={org.id} canGiveAdmin={isOwner} onDone={() => void refetch()} onError={fail} />
                {org.invitations.filter((i) => i.status === 'pending').length > 0 && (
                  <ul className="divide-y divide-border">
                    {org.invitations.filter((i) => i.status === 'pending').map((invitation) => (
                      <li key={invitation.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{invitation.email}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel(invitation.role ?? 'member')} · en attente</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(`${origin}/invitations/${invitation.id}`)
                                ok("Lien d'invitation copié.")
                              } catch {
                                setMessage({ kind: 'ok', text: `${origin}/invitations/${invitation.id}` })
                              }
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />Copier le lien
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const { error } = await authClient.organization.cancelInvitation({ invitationId: invitation.id })
                              if (error) fail(error)
                              else { ok('Invitation annulée.'); void refetch() }
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  L&apos;envoi automatique par e-mail n&apos;est pas encore actif : copiez le lien et transmettez-le à la personne invitée. Elle doit se connecter avec l&apos;adresse invitée.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><h2 className="font-semibold">Zone sensible</h2></CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirm({ kind: 'leave' })}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />Quitter l&apos;organisation
              </Button>
              {isOwner && <DeleteOrganization name={org.name} orgId={org.id} onError={fail} />}
            </CardContent>
          </Card>
        </>
      )}

      {org && confirm?.kind === 'remove' && (
        <ConfirmDialog
          open
          destructive
          title={`Retirer ${confirm.name} ?`}
          description={`${confirm.name} perdra immédiatement l'accès aux projets de « ${org.name} ». Ses propres organisations ne sont pas touchées.`}
          confirmLabel="Retirer le membre"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const { error } = await authClient.organization.removeMember({ memberIdOrEmail: confirm.memberId, organizationId: org.id })
            setConfirm(null)
            if (error) fail(error)
            else { ok('Membre retiré.'); void refetch() }
          }}
        />
      )}
      {org && confirm?.kind === 'leave' && (
        <ConfirmDialog
          open
          destructive
          title={`Quitter « ${org.name} » ?`}
          description="Vous n'aurez plus accès à ses projets. Un propriétaire pourra vous réinviter."
          confirmLabel="Quitter l'organisation"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const { error } = await authClient.organization.leave({ organizationId: org.id })
            setConfirm(null)
            if (error) return fail(error)
            router.push('/dashboard')
            router.refresh()
          }}
        />
      )}

      <Card>
        <CardHeader><h2 className="font-semibold">Nouvelle organisation</h2></CardHeader>
        <CardContent><CreateOrganization onError={fail} /></CardContent>
      </Card>
    </div>
  )
}

type OnError = (error: Parameters<typeof authErrorMessage>[0]) => void

function RenameForm({ orgId, name, onDone, onError }: { orgId: string; name: string; onDone: () => void; onError: OnError }) {
  const [value, setValue] = useState(name)
  const [loading, setLoading] = useState(false)
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        setLoading(true)
        const { error } = await authClient.organization.update({ organizationId: orgId, data: { name: value.trim() } })
        setLoading(false)
        if (error) onError(error)
        else onDone()
      }}
    >
      <div className="flex-1">
        <Input id="org-name" label="Nom de l'organisation" value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} required />
      </div>
      <Button type="submit" loading={loading} disabled={!value.trim() || value.trim() === name}>Enregistrer</Button>
    </form>
  )
}

function InviteForm({ orgId, canGiveAdmin, onDone, onError }: { orgId: string; canGiveAdmin: boolean; onDone: () => void; onError: OnError }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [loading, setLoading] = useState(false)
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        setLoading(true)
        const { error } = await authClient.organization.inviteMember({ email: email.trim(), role, organizationId: orgId })
        setLoading(false)
        if (error) return onError(error)
        setEmail('')
        onDone()
      }}
    >
      <div className="flex-1">
        <Input id="invite-email" type="email" label="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="invite-role" className="text-sm font-medium">Rôle</label>
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as InviteRole)} className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
          <option value="member">Membre</option>
          {canGiveAdmin && <option value="admin">Administrateur</option>}
        </select>
      </div>
      <Button type="submit" loading={loading}><UserPlus className="h-4 w-4" aria-hidden="true" />Inviter</Button>
    </form>
  )
}

function CreateOrganization({ onError }: { onError: OnError }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        setLoading(true)
        const trimmed = name.trim()
        // Le slug doit être unique : on suffixe d'un code aléatoire pour éviter les collisions.
        const slug = `${slugify(trimmed)}-${Math.random().toString(36).slice(2, 6)}`
        const { data, error } = await authClient.organization.create({ name: trimmed, slug })
        setLoading(false)
        if (error) return onError(error)
        if (data) await authClient.organization.setActive({ organizationId: data.id })
        setName('')
        router.refresh()
      }}
    >
      <div className="flex-1">
        <Input id="new-org" label="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </div>
      <Button type="submit" loading={loading} disabled={!name.trim()}>Créer</Button>
    </form>
  )
}

function DeleteOrganization({ name, orgId, onError }: { name: string; orgId: string; onError: OnError }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  if (!open) {
    return <Button variant="destructive" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" aria-hidden="true" />Supprimer l&apos;organisation</Button>
  }
  return (
    <form
      className="flex w-full flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        const { error } = await authClient.organization.delete({ organizationId: orgId })
        if (error) return onError(error)
        router.push('/dashboard')
        router.refresh()
      }}
    >
      <div className="flex-1">
        <Input id="confirm-delete" label={`Saisissez « ${name} » pour confirmer. Ses projets seront supprimés de la base.`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <Button type="submit" variant="destructive" disabled={confirm !== name}>Supprimer définitivement</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
    </form>
  )
}
