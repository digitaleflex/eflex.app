import Link from 'next/link'
import { MailWarning, Search, ShieldCheck, UserX, Users } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserActions } from '@/components/admin/user-actions'
import { requireAdminPage } from '@/lib/admin'
import { formatInteger } from '@/lib/table'

export const metadata = { title: 'Utilisateurs — Administration Eflex' }

const PAGE_SIZE = 20
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await requireAdminPage()
  const { q = '', page: pageParam } = await searchParams
  const query = q.trim().slice(0, 100)
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  const where = query
    ? { OR: [{ email: { contains: query, mode: 'insensitive' as const } }, { name: { contains: query, mode: 'insensitive' as const } }] }
    : {}
  const [total, accounts, admins, suspended, unverified, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'admin' } }),
    prisma.user.count({ where: { banned: true } }),
    prisma.user.count({ where: { emailVerified: false } }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, role: true, banned: true, banReason: true, emailVerified: true, createdAt: true, _count: { select: { members: true } } },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // Chaîne sérialisable : `Pagination` est un composant client, il ne peut pas recevoir de fonction.
  const hrefTemplate = `/admin/users?${query ? `q=${encodeURIComponent(query)}&` : ''}page=`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Utilisateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatInteger(total)} compte{total > 1 ? 's' : ''}{query && ` correspondant à « ${query} »`}.
        </p>
      </div>

      <section aria-label="Indicateurs des comptes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Comptes" value={formatInteger(accounts)} hint="Toutes organisations confondues" icon={Users} />
        <StatCard label="Administrateurs" value={formatInteger(admins)} hint="Accès complet à la console" icon={ShieldCheck} tone="info" />
        <StatCard label="Comptes suspendus" value={formatInteger(suspended)} hint="Connexion bloquée" icon={UserX} tone={suspended > 0 ? 'critical' : 'neutral'} />
        <StatCard label="E-mails non vérifiés" value={formatInteger(unverified)} hint="Relance possible depuis le compte" icon={MailWarning} tone={unverified > 0 ? 'warning' : 'neutral'} />
      </section>

      <form role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">Rechercher par nom ou adresse e-mail</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Nom ou adresse e-mail"
          className="h-11 rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-1"
        />
        <Button type="submit">Rechercher</Button>
      </form>

      <Card>
        {users.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Aucun utilisateur trouvé"
            description={
              query
                ? "Aucun compte ne correspond à cette recherche. Vérifiez l'orthographe ou essayez une partie de l'adresse e-mail."
                : "Aucun compte n'est encore inscrit. Les nouvelles inscriptions apparaîtront ici."
            }
            action={
              query ? (
                <Link
                  href="/admin/users"
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-input bg-background px-4 text-sm font-medium hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Réinitialiser la recherche
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
          <ul className="divide-y divide-border sm:hidden" aria-label="Liste des utilisateurs">
            {users.map((u) => (
              <li key={u.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <Avatar name={u.name || u.email} decorative size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {u.name}
                        {u.role === 'admin' && <StatusBadge status="admin" label="Admin" tone="info" dot={false} className="ml-2" />}
                      </p>
                      <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{u.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Inscrit le {date.format(u.createdAt)}{!u.emailVerified && ' · e-mail non vérifié'}</p>
                    </div>
                  </div>
                  {u.banned ? (
                    <StatusBadge status="suspended" title={u.banReason ?? undefined} />
                  ) : (
                    <StatusBadge status="active" />
                  )}
                </div>
                {u.banned && u.banReason && <p className="text-xs text-muted-foreground">Motif : {u.banReason}</p>}
                {u.id !== session.user.id && u.role !== 'admin' && (
                  <UserActions id={u.id} name={u.name} banned={Boolean(u.banned)} />
                )}
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm sm:table">
            <caption className="sr-only">Liste des utilisateurs, du plus récent au plus ancien</caption>
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Utilisateur</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Organisations</th>
                <th scope="col" className="px-4 py-3 font-medium">Inscrit le</th>
                <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={u.name || u.email} decorative size="sm" className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {u.name}
                          {u.role === 'admin' && <StatusBadge status="admin" label="Admin" tone="info" dot={false} className="ml-2" />}
                        </p>
                        <p className="break-all text-xs text-muted-foreground">{u.email}{!u.emailVerified && ' · e-mail non vérifié'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{u._count.members}</td>
                  <td className="px-4 py-3">{date.format(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    {u.banned ? (
                      <StatusBadge status="suspended" title={u.banReason ?? undefined} />
                    ) : (
                      <StatusBadge status="active" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id === session.user.id || u.role === 'admin' ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <UserActions id={u.id} name={u.name} banned={Boolean(u.banned)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Card>

      <Pagination page={page} pages={pages} hrefTemplate={hrefTemplate} />
    </div>
  )
}
