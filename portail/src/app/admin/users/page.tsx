import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { UserActions } from '@/components/admin/user-actions'
import { requireAdminPage } from '@/lib/admin'

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
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, name: true, email: true, role: true, banned: true, banReason: true, emailVerified: true, createdAt: true, _count: { select: { members: true } } },
    }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(p) })}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Utilisateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} compte{total > 1 ? 's' : ''}{query && ` correspondant à « ${query} »`}.</p>
      </div>

      <form role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">Rechercher par nom ou adresse e-mail</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Nom ou adresse e-mail"
          className="h-11 sm:flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Rechercher
        </button>
      </form>

      <Card>
        {users.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">Aucun utilisateur trouvé</p>
            <p className="mt-1 text-sm text-muted-foreground">Aucun compte ne correspond à cette recherche. Vérifiez l&apos;orthographe ou essayez une partie de l&apos;adresse e-mail.</p>
          </div>
        ) : (
          <>
          <ul className="divide-y divide-border sm:hidden" aria-label="Liste des utilisateurs">
            {users.map((u) => (
              <li key={u.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{u.name}{u.role === 'admin' && <Badge className="ml-2">Admin</Badge>}</p>
                    <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{u.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Inscrit le {date.format(u.createdAt)}{!u.emailVerified && ' · e-mail non vérifié'}</p>
                  </div>
                  {u.banned ? <Badge variant="destructive">Suspendu</Badge> : <Badge variant="success">Actif</Badge>}
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
                    <p className="font-medium">{u.name}{u.role === 'admin' && <Badge className="ml-2">Admin</Badge>}</p>
                    <p className="break-all text-xs text-muted-foreground">{u.email}{!u.emailVerified && ' · e-mail non vérifié'}</p>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{u._count.members}</td>
                  <td className="px-4 py-3">{date.format(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    {u.banned ? <Badge variant="destructive" title={u.banReason ?? undefined}>Suspendu</Badge> : <Badge variant="success">Actif</Badge>}
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

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center text-primary hover:underline">← Précédent</Link> : <span />}
          <span aria-current="page" className="text-muted-foreground">Page {page} sur {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center text-primary hover:underline">Suivant →</Link> : <span />}
        </nav>
      )}
    </div>
  )
}
