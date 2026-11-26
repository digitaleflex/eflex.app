import Link from 'next/link'
import { ArrowUpRight, LifeBuoy } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { supportCategoryLabel, supportPriorityLabel, supportStatusLabel } from '@/lib/support-tickets'
import { PageHeader } from '@/components/page-header'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatInteger } from '@/lib/table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support — Administration' }

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'open':
      return 'info'
    case 'in_progress':
    case 'waiting_user':
      return 'warning'
    case 'resolved':
      return 'success'
    case 'closed':
      return 'outline'
    default:
      return 'default'
  }
}

function priorityVariant(priority: string): BadgeVariant {
  switch (priority) {
    case 'high':
      return 'destructive'
    case 'low':
      return 'outline'
    case 'normal':
      return 'default'
    default:
      return 'default'
  }
}

export default async function AdminSupportPage() {
  await requireAdminPage('admin.support.read')
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
      organization: { select: { name: true, slug: true } },
      project: { select: { name: true } },
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets de support"
        description={
          tickets.length === 0
            ? 'Demandes soumises par les utilisateurs et les organisations.'
            : `${formatInteger(tickets.length)} ticket${tickets.length > 1 ? 's' : ''} le${tickets.length > 1 ? 's' : ''} plus récent${tickets.length > 1 ? 's' : ''} (100 maximum).`
        }
      />

      <Card>
        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Aucun ticket"
            description="Les demandes de support envoyées par les utilisateurs apparaîtront ici."
          />
        ) : (
          <>
            <ul className="divide-y divide-border sm:hidden" aria-label="Liste des tickets de support">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/support/${ticket.id}`}
                      className="min-h-11 font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {ticket.subject}
                    </Link>
                    <Badge variant={statusVariant(ticket.status)}>{supportStatusLabel(ticket.status)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{supportCategoryLabel(ticket.category)}</Badge>
                    <Badge variant={priorityVariant(ticket.priority)}>{supportPriorityLabel(ticket.priority)}</Badge>
                  </div>
                  <p className="text-sm text-foreground">{ticket.user.name || ticket.user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.organization?.name ?? ticket.project?.name ?? 'Aucun contexte associé'}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    <time dateTime={ticket.createdAt.toISOString()}>
                      {new Date(ticket.createdAt).toLocaleString('fr-FR')}
                    </time>
                  </p>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Tickets de support, du plus récent au plus ancien
                </caption>
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Sujet
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Statut
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Catégorie
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Priorité
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Utilisateur
                    </th>
                    <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                      Contexte
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Créé
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Détail</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="max-w-xs px-4 py-3">
                        <Link
                          href={`/admin/support/${ticket.id}`}
                          className="inline-flex min-h-11 items-center font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                        >
                          <span className="truncate">{ticket.subject}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(ticket.status)}>{supportStatusLabel(ticket.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{supportCategoryLabel(ticket.category)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={priorityVariant(ticket.priority)}>{supportPriorityLabel(ticket.priority)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-foreground">{ticket.user.name || ticket.user.email}</span>
                        {ticket.user.name ? (
                          <span className="block text-xs text-muted-foreground">{ticket.user.email}</span>
                        ) : null}
                      </td>
                      <td className="hidden max-w-48 px-4 py-3 text-muted-foreground lg:table-cell">
                        <span className="block truncate">
                          {ticket.organization?.name ?? ticket.project?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        <time dateTime={ticket.createdAt.toISOString()}>
                          {new Date(ticket.createdAt).toLocaleString('fr-FR')}
                        </time>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/support/${ticket.id}`}
                          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                        >
                          Ouvrir
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only"> le ticket « {ticket.subject} »</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
