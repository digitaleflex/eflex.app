'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, LogOut, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { slugify } from '@/lib/slug'
import { canManageBilling } from '@/lib/organizations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useEvents } from '@/hooks/events-provider'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/page-header'
import { BillingCard } from '@/components/organization/billing-card'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  billing: 'Facturation',
  member: 'Membre',
}
const roleLabel = (role: string) => ROLE_LABEL[role] ?? role

/** Capacités réelles de chaque rôle Better Auth. Aucune permission n'est modifiée ici. */
const ROLE_DESCRIPTION: Record<string, string> = {
  owner: 'Gère l’organisation, les membres, les projets et la facturation. Seul rôle autorisé à supprimer l’organisation.',
  admin: 'Gère les membres et les projets, et accède à la facturation.',
  billing: 'Gère l’abonnement et les paiements, sans accès aux projets ni aux journaux.',
  member: 'Consulte les projets de l’organisation. Ne peut ni créer, ni relancer, ni gérer la facturation.',
}

const ROLES = ['owner', 'admin', 'billing', 'member'] as const

const invitationDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Paris',
})

type InviteRole = 'admin' | 'billing' | 'member'
type PendingRole = { memberId: string; name: string; currentRole: string; nextRole: string }

export function OrganizationPanel({ currentUserId }: { currentUserId: string }) {
  const router = useRouter()
  const { data: org, isPending, refetch } = authClient.useActiveOrganization()
  // Temps réel : un autre onglet ou une autre personne modifie l'équipe ou les invitations.
  useEvents(['member.added', 'member.removed', 'member.updated', 'invitation.created', 'invitation.updated'], () =>
    void refetch(),
  )
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<
    null | { kind: 'remove'; memberId: string; name: string } | { kind: 'leave' }
  >(null)
  const [pendingRole, setPendingRole] = useState<PendingRole | null>(null)

  const fail = (error: Parameters<typeof authErrorMessage>[0]) =>
    setMessage({ kind: 'error', text: authErrorMessage(error) })
  const ok = (text: string) => setMessage({ kind: 'ok', text })

  if (isPending) {
    return (
      <div className="max-w-4xl space-y-6" aria-busy="true">
        <PageHeader title="Équipe" description="Chargement de l’organisation…" />
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Équipe"
          description="Les projets appartiennent à une organisation : tous ses membres les voient, selon leur rôle."
        />
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6">
          <p className="font-medium">Aucune organisation active</p>
          <p className="text-sm text-muted-foreground">
            Votre session n’est rattachée à aucune organisation. Rechargez la page ou créez une organisation
            ci-dessous.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Réessayer
          </Button>
        </div>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Nouvelle organisation</h2>
          </CardHeader>
          <CardContent>
            <CreateOrganization onError={fail} />
          </CardContent>
        </Card>
        {message ? <Message kind={message.kind} text={message.text} /> : null}
      </div>
    )
  }

  const me = org.members.find((member) => member.userId === currentUserId)
  const myRole = me?.role ?? 'member'
  const canInvite = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const pendingInvitations = org.invitations.filter((invitation) => invitation.status === 'pending')

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Équipe"
        description="Les projets appartiennent à une organisation : tous ses membres les voient, selon leur rôle. Invitez des personnes, changez leur rôle ou retirez leur accès."
        actions={<Badge variant="outline">Votre rôle : {roleLabel(myRole)}</Badge>}
      />

      {message ? <Message kind={message.kind} text={message.text} /> : null}

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{org.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Le nom affiché dans la console, les notifications et les factures.
          </p>
        </CardHeader>
        <CardContent>
          {canInvite ? (
            <RenameForm
              key={org.id}
              orgId={org.id}
              name={org.name}
              hasError={message?.kind === 'error'}
              onDone={() => {
                ok('Organisation mise à jour.')
                void refetch()
              }}
              onError={fail}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Seuls les propriétaires et administrateurs peuvent modifier l’organisation.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Rôles et permissions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ces rôles sont ceux de Better Auth : cette page les rend lisibles, elle ne les modifie pas.
          </p>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            {ROLES.map((role) => (
              <div key={role} className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-sm font-medium">{roleLabel(role)}</dt>
                <dd className="text-sm text-muted-foreground">{ROLE_DESCRIPTION[role]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {canManageBilling(myRole) ? (
        <BillingCard />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Facturation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              La facturation est réservée au propriétaire, aux administrateurs et au rôle facturation. Un
              propriétaire peut vous y donner accès sans vous confier la gestion des projets.
            </p>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Membres ({org.members.length})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canInvite
              ? 'Changez un rôle pour ajuster les accès. Le retrait d’un membre demande une confirmation.'
              : 'Seuls les propriétaires et administrateurs peuvent modifier les rôles et retirer des membres.'}
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {org.members.map((member) => {
              const self = member.userId === currentUserId
              const editable = canInvite && !self && (isOwner || member.role === 'member')
              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.user.name}
                      {self ? ' (vous)' : ''}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{roleLabel(member.role)}</Badge>
                    {editable ? (
                      <>
                        <label className="sr-only" htmlFor={`role-${member.id}`}>
                          Rôle de {member.user.name}
                        </label>
                        <select
                          id={`role-${member.id}`}
                          value={member.role}
                          onChange={(e) => {
                            const nextRole = e.target.value
                            if (nextRole === member.role) return
                            setPendingRole({
                              memberId: member.id,
                              name: member.user.name,
                              currentRole: member.role,
                              nextRole,
                            })
                          }}
                          className="h-11 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="member">Membre</option>
                          <option value="admin">Administrateur</option>
                          {isOwner ? <option value="owner">Propriétaire</option> : null}
                          {isOwner ? <option value="billing">Facturation</option> : null}
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
                    ) : self ? (
                      <span className="text-xs text-muted-foreground">Votre propre rôle ne se modifie pas ici.</span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {canInvite ? (
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-semibold">
              <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Invitations
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              L’envoi automatique par e-mail n’est pas encore actif : copiez le lien et transmettez-le à la
              personne invitée. Elle doit se connecter avec l’adresse invitée.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <InviteForm
              key={org.id}
              orgId={org.id}
              canGiveAdmin={isOwner}
              hasError={message?.kind === 'error'}
              onDone={() => {
                ok('Invitation créée. Copiez le lien ci-dessous et transmettez-le.')
                void refetch()
              }}
              onError={fail}
            />

            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-medium">
                Invitations en attente ({pendingInvitations.length})
              </h3>
              {pendingInvitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune invitation en attente. Les invitations créées apparaîtront ici avec leur lien.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {pendingInvitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Rôle : {roleLabel(invitation.role ?? 'member')} · en attente
                          {invitation.expiresAt
                            ? ` · expire le ${invitationDate.format(new Date(invitation.expiresAt))}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`${origin}/invitations/${invitation.id}`)
                              ok('Lien d’invitation copié.')
                            } catch {
                              setMessage({ kind: 'ok', text: `${origin}/invitations/${invitation.id}` })
                            }
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Copier le lien
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const { error } = await authClient.organization.cancelInvitation({
                              invitationId: invitation.id,
                            })
                            if (error) fail(error)
                            else {
                              ok('Invitation annulée.')
                              void refetch()
                            }
                          }}
                        >
                          Annuler l’invitation
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Zone sensible</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quitter l’organisation vous retire l’accès à ses projets. La suppression est réservée au
            propriétaire et demande la saisie du nom.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setConfirm({ kind: 'leave' })}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Quitter l’organisation
          </Button>
          {isOwner ? <DeleteOrganization name={org.name} orgId={org.id} onError={fail} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Nouvelle organisation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez une organisation séparée : ses projets, membres et sa facturation sont indépendants.
          </p>
        </CardHeader>
        <CardContent>
          <CreateOrganization onError={fail} />
        </CardContent>
      </Card>

      {confirm?.kind === 'remove' ? (
        <ConfirmDialog
          open
          destructive
          title={`Retirer ${confirm.name} ?`}
          description={`${confirm.name} perdra immédiatement l’accès aux projets de « ${org.name} ». Ses propres organisations ne sont pas touchées.`}
          confirmLabel="Retirer le membre"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const { error } = await authClient.organization.removeMember({
              memberIdOrEmail: confirm.memberId,
              organizationId: org.id,
            })
            setConfirm(null)
            if (error) fail(error)
            else {
              ok('Membre retiré.')
              void refetch()
            }
          }}
        />
      ) : null}

      {confirm?.kind === 'leave' ? (
        <ConfirmDialog
          open
          destructive
          title={`Quitter « ${org.name} » ?`}
          description="Vous n’aurez plus accès à ses projets. Un propriétaire pourra vous réinviter."
          confirmLabel="Quitter l’organisation"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const { error } = await authClient.organization.leave({ organizationId: org.id })
            setConfirm(null)
            if (error) return fail(error)
            router.push('/dashboard')
            router.refresh()
          }}
        />
      ) : null}

      {pendingRole ? (
        <ConfirmDialog
          open
          destructive={pendingRole.nextRole === 'member' && pendingRole.currentRole !== 'member'}
          title={`Changer le rôle de ${pendingRole.name} ?`}
          description={
            <>
              <span className="block">
                {pendingRole.name} passera de « {roleLabel(pendingRole.currentRole)} » à «{' '}
                {roleLabel(pendingRole.nextRole)} ».
              </span>
              <span className="mt-2 block">{ROLE_DESCRIPTION[pendingRole.nextRole]}</span>
            </>
          }
          confirmLabel="Changer le rôle"
          onCancel={() => setPendingRole(null)}
          onConfirm={async () => {
            const target = pendingRole
            setPendingRole(null)
            const { error } = await authClient.organization.updateMemberRole({
              memberId: target.memberId,
              role: target.nextRole as 'owner' | 'admin' | 'billing' | 'member',
              organizationId: org.id,
            })
            if (error) fail(error)
            else {
              ok('Rôle mis à jour.')
              void refetch()
            }
          }}
        />
      ) : null}
    </div>
  )
}

function Message({ kind, text }: { kind: 'error' | 'ok'; text: string }) {
  return (
    <p
      id="organization-feedback"
      role={kind === 'error' ? 'alert' : 'status'}
      className={
        kind === 'error'
          ? 'rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
          : 'rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-foreground'
      }
    >
      {text}
    </p>
  )
}

type OnError = (error: Parameters<typeof authErrorMessage>[0]) => void

function RenameForm({
  orgId,
  name,
  hasError,
  onDone,
  onError,
}: {
  orgId: string
  name: string
  hasError: boolean
  onDone: () => void
  onError: OnError
}) {
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
        <Input
          id="org-name"
          label="Nom de l’organisation"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={60}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? 'organization-feedback' : undefined}
          required
        />
      </div>
      <Button
        type="submit"
        loading={loading}
        disabled={!value.trim() || value.trim() === name}
        disabledReason={value.trim() ? 'Aucune modification à enregistrer' : 'Le nom ne peut pas être vide'}
      >
        Enregistrer le nom
      </Button>
    </form>
  )
}

function InviteForm({
  orgId,
  canGiveAdmin,
  hasError,
  onDone,
  onError,
}: {
  orgId: string
  canGiveAdmin: boolean
  hasError: boolean
  onDone: () => void
  onError: OnError
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [loading, setLoading] = useState(false)
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        setLoading(true)
        const { error } = await authClient.organization.inviteMember({
          email: email.trim(),
          // Le serveur accepte aussi le rôle personnalisé `billing` ; les types
          // générés du client ne connaissent que les rôles Better Auth.
          role: role as 'admin' | 'member',
          organizationId: orgId,
        })
        setLoading(false)
        if (error) return onError(error)
        setEmail('')
        onDone()
      }}
    >
      <div className="flex-1">
        <Input
          id="invite-email"
          type="email"
          label="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? 'organization-feedback' : undefined}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="invite-role" className="text-sm font-medium">
          Rôle proposé
        </label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
          aria-describedby={hasError ? 'organization-feedback' : undefined}
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="member">Membre</option>
          {canGiveAdmin ? <option value="admin">Administrateur</option> : null}
          {canGiveAdmin ? <option value="billing">Facturation</option> : null}
        </select>
      </div>
      <Button type="submit" loading={loading}>
        <UserPlus className="h-4 w-4" aria-hidden="true" />
        Inviter
      </Button>
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
        <Input
          id="new-org"
          label="Nom de la nouvelle organisation"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
        />
      </div>
      <Button type="submit" loading={loading} disabled={!name.trim()}>
        Créer l’organisation
      </Button>
    </form>
  )
}

function DeleteOrganization({ name, orgId, onError }: { name: string; orgId: string; onError: OnError }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Supprimer l’organisation
      </Button>
    )
  }
  return (
    <form
      className="flex w-full flex-col gap-3 rounded-lg border border-destructive/30 p-3 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        const { error } = await authClient.organization.delete({ organizationId: orgId })
        if (error) return onError(error)
        router.push('/dashboard')
        router.refresh()
      }}
    >
      <div className="flex-1">
        <Input
          id="confirm-delete"
          label={`Saisissez « ${name} » pour confirmer. Ses projets seront supprimés de la base.`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <Button type="submit" variant="destructive" disabled={confirm !== name}>
        Supprimer définitivement
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </Button>
    </form>
  )
}
