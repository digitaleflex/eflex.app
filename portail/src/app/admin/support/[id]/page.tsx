import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { supportCategoryLabel, supportPriorityLabel, supportStatusLabel } from '@/lib/support-tickets'
import { AdminTicketActions } from '@/components/support/admin-ticket-actions'

export const dynamic = 'force-dynamic'

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground"><Link href="/admin/support" className="hover:underline">← Retour aux tickets</Link></p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {supportCategoryLabel(ticket.category)} · {supportPriorityLabel(ticket.priority)} · {supportStatusLabel(ticket.status)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-sm font-semibold mb-3">Description</h2>
            <pre className="whitespace-pre-wrap break-words text-sm text-foreground font-sans">{ticket.body}</pre>
          </div>
          {ticket.adminNote && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 sm:p-6">
              <h2 className="text-sm font-semibold mb-2">Note interne</h2>
              <pre className="whitespace-pre-wrap break-words text-sm font-sans">{ticket.adminNote}</pre>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2">
            <div><span className="text-muted-foreground">Auteur :</span> <span className="font-medium">{ticket.user.name || ticket.user.email}</span></div>
            <div className="text-xs text-muted-foreground break-all">{ticket.user.email}</div>
            {ticket.organization && <div><span className="text-muted-foreground">Organisation :</span> {ticket.organization.name}</div>}
            {ticket.project && <div><span className="text-muted-foreground">Projet :</span> <Link href={`/admin/projects/${ticket.project.id}`} className="text-primary hover:underline">{ticket.project.name}</Link></div>}
            {ticket.deployment && <div><span className="text-muted-foreground">Déploiement :</span> {ticket.deployment.id.slice(0, 12)} ({ticket.deployment.status})</div>}
            <div><span className="text-muted-foreground">Créé :</span> {new Date(ticket.createdAt).toLocaleString('fr-FR')}</div>
            <div><span className="text-muted-foreground">Mis à jour :</span> {new Date(ticket.updatedAt).toLocaleString('fr-FR')}</div>
          </div>
          <AdminTicketActions ticketId={ticket.id} status={ticket.status} priority={ticket.priority} adminNote={ticket.adminNote ?? ''} />
        </aside>
      </div>
    </div>
  )
}
