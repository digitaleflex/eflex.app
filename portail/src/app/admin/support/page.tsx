import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import Link from 'next/link'
import { supportCategoryLabel, supportPriorityLabel, supportStatusLabel } from '@/lib/support-tickets'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support — Administration EFLEX' }

export default async function AdminSupportPage() {
  await requireAdminPage()
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tickets de support</h1>
        <p className="mt-1 text-sm text-muted-foreground">Demandes soumises par les utilisateurs et organisations.</p>
      </div>
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">Aucun ticket.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Sujet</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Catégorie</th>
                <th className="px-4 py-3 font-medium">Priorité</th>
                <th className="px-4 py-3 font-medium">Utilisateur</th>
                <th className="px-4 py-3 font-medium">Contexte</th>
                <th className="px-4 py-3 font-medium">Créé</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium"><Link href={`/admin/support/${t.id}`} className="text-primary hover:underline">{t.subject}</Link></td>
                  <td className="px-4 py-3">{supportStatusLabel(t.status)}</td>
                  <td className="px-4 py-3">{supportCategoryLabel(t.category)}</td>
                  <td className="px-4 py-3">{supportPriorityLabel(t.priority)}</td>
                  <td className="px-4 py-3">{t.user.name || t.user.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.organization?.name ?? t.project?.name ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{new Date(t.createdAt).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
