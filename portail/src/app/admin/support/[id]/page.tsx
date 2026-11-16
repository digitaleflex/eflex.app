import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { supportCategoryLabel, supportPriorityLabel, supportStatusLabel } from '@/lib/support-tickets'
import { AdminTicketActions } from '@/components/support/admin-ticket-actions'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

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

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, slug: true } },
      project: { select: { id: true, name: true, slug: true } },
      deployment: { select: { id: true, status: true, commitSha: true, createdAt: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })
  if (!ticket) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(ticket.status)}>{supportStatusLabel(ticket.status)}</Badge>
            <Badge variant="outline">{supportCategoryLabel(ticket.category)}</Badge>
            <Badge variant={priorityVariant(ticket.priority)}>
              Priorité {supportPriorityLabel(ticket.priority).toLowerCase()}
            </Badge>
          </span>
        }
        actions={
          <LinkButton href="/admin/support">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour aux tickets
          </LinkButton>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <Card className="p-4 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold">Description</h2>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground [overflow-wrap:anywhere]">
              {ticket.body}
            </pre>
          </Card>
          {ticket.adminNote && (
            <Card className="border-info/20 bg-info/5 p-4 sm:p-6">
              <h2 className="mb-3 text-sm font-semibold">Note interne</h2>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground [overflow-wrap:anywhere]">
                {ticket.adminNote}
              </pre>
            </Card>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="space-y-3 p-4 text-sm">
            <h2 className="text-sm font-semibold">Informations</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-muted-foreground">Auteur</dt>
                <dd className="font-medium text-foreground">{ticket.user.name || ticket.user.email}</dd>
                <dd className="break-all text-xs text-muted-foreground [overflow-wrap:anywhere]">{ticket.user.email}</dd>
              </div>
              {ticket.organization && (
                <div>
                  <dt className="text-xs text-muted-foreground">Organisation</dt>
                  <dd className="text-foreground">{ticket.organization.name}</dd>
                </div>
              )}
              {ticket.project && (
                <div>
                  <dt className="text-xs text-muted-foreground">Projet</dt>
                  <dd>
                    <Link
                      href={`/admin/projects/${ticket.project.id}`}
                      className="inline-flex min-h-11 items-center font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                    >
                      {ticket.project.name}
                    </Link>
                  </dd>
                </div>
              )}
              {ticket.deployment && (
                <div>
                  <dt className="text-xs text-muted-foreground">Déploiement</dt>
                  <dd className="text-foreground">
                    <span className="font-mono">{ticket.deployment.id.slice(0, 12)}</span> ({ticket.deployment.status})
                  </dd>
                </div>
              )}
              {ticket.assignedTo && (
                <div>
                  <dt className="text-xs text-muted-foreground">Assigné à</dt>
                  <dd className="text-foreground">{ticket.assignedTo.name || ticket.assignedTo.email}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Créé</dt>
                <dd className="tabular-nums text-foreground">
                  <time dateTime={ticket.createdAt.toISOString()}>
                    {new Date(ticket.createdAt).toLocaleString('fr-FR')}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Mis à jour</dt>
                <dd className="tabular-nums text-foreground">
                  <time dateTime={ticket.updatedAt.toISOString()}>
                    {new Date(ticket.updatedAt).toLocaleString('fr-FR')}
                  </time>
                </dd>
              </div>
            </dl>
          </Card>
          <AdminTicketActions
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            adminNote={ticket.adminNote ?? ''}
          />
        </aside>
      </div>
    </div>
  )
}
