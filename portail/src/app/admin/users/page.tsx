import {
  MailWarning,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserX,
  Users,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserActions } from '@/components/admin/user-actions'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { requireAdminPage } from '@/lib/admin'
import { formatInteger } from '@/lib/table'
import {
  ADMIN_USERS_PAGE_SIZE,
  USER_ROLE_FILTERS,
  USER_ROLE_LABEL,
  USER_STATUS_FILTERS,
  USER_STATUS_LABEL,
  USER_VERIFICATION_FILTERS,
  USER_VERIFICATION_LABEL,
  isUserListFiltered,
  parseUserListQuery,
  userListHrefTemplate,
  userListWhere,
} from '@/lib/admin-users'

export const metadata = { title: 'Utilisateurs — Administration EFLEX' }
export const dynamic = 'force-dynamic'

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const roleOptions = USER_ROLE_FILTERS.map((value) => ({ value, label: USER_ROLE_LABEL[value] }))
const statusOptions = USER_STATUS_FILTERS.map((value) => ({ value, label: USER_STATUS_LABEL[value] }))
const verificationOptions = USER_VERIFICATION_FILTERS.map((value) => ({
  value,
  label: USER_VERIFICATION_LABEL[value],
}))

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; statut?: string; email?: string; page?: string }>
}) {
  const session = await requireAdminPage()
  const query = parseUserListQuery(await searchParams)
  const where = userListWhere(query)
  const filtered = isUserListFiltered(query)

  const [accounts, admins, suspended, unverified] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.user.count({ where: { banned: true } }),
    prisma.user.count({ where: { emailVerified: false } }),
  ])

  const total = await prisma.user.count({ where })
  const pages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE))
  const page = Math.min(query.page, pages)

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
    take: ADMIN_USERS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      banReason: true,
      banExpires: true,
      emailVerified: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  })

  const countLabel = `${formatInteger(total)} compte${total > 1 ? 's' : ''}`
  const summary = filtered
    ? `${countLabel} ${total > 1 ? 'correspondants' : 'correspondant'} aux filtres, sur ${formatInteger(accounts)} au total.`
    : `${countLabel} au total, toutes organisations confondues.`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        description="Comptes de la plateforme, du plus récent au plus ancien. Rôle plateforme, vérification de l’e-mail et suspension sont trois informations distinctes."
      />

      <section aria-label="Indicateurs des comptes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Comptes"
          value={formatInteger(accounts)}
          hint="Toutes organisations confondues"
          icon={Users}
          href="/admin/users"
        />
        <StatCard
          label="Administrateurs"
          value={formatInteger(admins)}
          hint={`Sur ${formatInteger(accounts)} comptes · rôle plateforme « admin », accès complet à la console`}
          icon={ShieldCheck}
          tone="info"
          href="/admin/users?role=admin"
        />
        <StatCard
          label="Comptes suspendus"
          value={formatInteger(suspended)}
          hint={`Sur ${formatInteger(accounts)} comptes · connexion bloquée, applications toujours en ligne`}
          icon={UserX}
          tone={suspended > 0 ? 'critical' : 'neutral'}
          href="/admin/users?statut=suspended"
        />
        <StatCard
          label="E-mails non vérifiés"
          value={formatInteger(unverified)}
          hint={`Sur ${formatInteger(accounts)} comptes · adresse non confirmée par la personne`}
          icon={MailWarning}
          tone={unverified > 0 ? 'warning' : 'neutral'}
          href="/admin/users?email=unverified"
        />
      </section>

      <form
        role="search"
        method="get"
        action="/admin/users"
        className="space-y-4 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Rechercher et filtrer</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2 xl:col-span-1">
            <Input
              id="q"
              name="q"
              type="search"
              label="Nom ou adresse e-mail"
              defaultValue={query.query}
              placeholder="ex. awa ou awa@exemple.com"
              hint="Recherche sans distinction de casse."
            />
          </div>
          <Select name="role" label="Rôle plateforme" defaultValue={query.role} options={roleOptions} />
          <Select name="statut" label="Suspension" defaultValue={query.status} options={statusOptions} />
          <Select name="email" label="Vérification de l’e-mail" defaultValue={query.verification} options={verificationOptions} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
            Appliquer les filtres
          </Button>
          {filtered ? <LinkButton href="/admin/users">Réinitialiser</LinkButton> : null}
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {summary}
          </p>
        </div>
      </form>

      <Card>
        {users.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Aucun utilisateur trouvé"
            description={
              filtered
                ? 'Aucun compte ne correspond à cette recherche et à ces filtres. Vérifiez l’orthographe ou élargissez les filtres.'
                : "Aucun compte n’est encore inscrit. Les nouvelles inscriptions apparaîtront ici."
            }
            action={filtered ? <LinkButton href="/admin/users">Réinitialiser la recherche</LinkButton> : undefined}
          />
        ) : (
          <>
            <ul className="divide-y divide-border sm:hidden" aria-label="Liste des utilisateurs">
              {users.map((user) => (
                <li key={user.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={user.name || user.email} decorative size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium">{user.name}</p>
                      <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.email}</p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Rôle</dt>
                      <dd className="mt-1">
                        {user.role === 'admin' ? (
                          <StatusBadge status="admin" label="Administrateur" tone="info" dot={false} />
                        ) : (
                          <StatusBadge status="member" label="Compte standard" tone="neutral" dot={false} />
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">E-mail</dt>
                      <dd className="mt-1">
                        <StatusBadge status={user.emailVerified ? 'verified' : 'unverified'} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Suspension</dt>
                      <dd className="mt-1">
                        <StatusBadge
                          status={user.banned ? 'suspended' : 'active'}
                          title={user.banned ? (user.banReason ?? undefined) : undefined}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Inscrit le</dt>
                      <dd className="mt-1">{date.format(user.createdAt)}</dd>
                    </div>
                  </dl>

                  {user.banned && (user.banReason || user.banExpires) ? (
                    <p className="text-xs text-muted-foreground">
                      {user.banReason ? `Motif : ${user.banReason}` : 'Motif non renseigné'}
                      {user.banExpires ? ` · jusqu’au ${dateTime.format(user.banExpires)}` : ''}
                    </p>
                  ) : null}

                  {user.id !== session.user.id && user.role !== 'admin' ? (
                    <UserActions id={user.id} name={user.name} banned={Boolean(user.banned)} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {user.id === session.user.id
                        ? 'Votre compte : aucune action de suspension.'
                        : 'Un administrateur ne se suspend pas depuis cette page.'}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-left text-sm sm:table">
              <caption className="sr-only">
                Liste des utilisateurs, du plus récent au plus ancien. Rôle plateforme, vérification de l’e-mail et
                suspension sont affichés séparément.
              </caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Utilisateur</th>
                  <th scope="col" className="px-4 py-3 font-medium">Rôle</th>
                  <th scope="col" className="px-4 py-3 font-medium">E-mail</th>
                  <th scope="col" className="px-4 py-3 font-medium">Suspension</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Organisations</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Inscrit le</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Avatar name={user.name || user.email} decorative size="sm" className="mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium">{user.name}</p>
                          <p className="break-all text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.role === 'admin' ? (
                        <StatusBadge status="admin" label="Administrateur" tone="info" dot={false} />
                      ) : (
                        <StatusBadge status="member" label="Compte standard" tone="neutral" dot={false} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.emailVerified ? 'verified' : 'unverified'} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={user.banned ? 'suspended' : 'active'}
                        title={user.banned ? (user.banReason ?? undefined) : undefined}
                      />
                      {user.banned && (user.banReason || user.banExpires) ? (
                        <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                          {user.banReason ?? 'Motif non renseigné'}
                          {user.banExpires ? ` · jusqu’au ${dateTime.format(user.banExpires)}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{user._count.members}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">{date.format(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {user.id === session.user.id || user.role === 'admin' ? (
                        <span className="text-xs text-muted-foreground">
                          {user.id === session.user.id ? 'Vous' : '—'}
                        </span>
                      ) : (
                        <UserActions id={user.id} name={user.name} banned={Boolean(user.banned)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Pagination page={page} pages={pages} hrefTemplate={userListHrefTemplate(query)} label="Pagination des utilisateurs" />
    </div>
  )
}
