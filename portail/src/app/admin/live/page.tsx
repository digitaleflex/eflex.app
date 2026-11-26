import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { PageHeader } from '@/components/page-header'
import { LiveFeed } from '@/components/admin/live-feed'
import { organizationNames, toWireEvent } from '@/lib/live-events-server'

export const metadata = { title: 'Activité en direct — Administration' }
// Flux propre à chaque session : jamais de cache.
export const dynamic = 'force-dynamic'

const INITIAL_EVENTS = 100

/**
 * Terminal d'exploitation : vue globale (toutes organisations) des événements de la
 * plateforme. La page rend l'historique récent côté serveur, puis le composant client
 * suit le flux en direct et permet pause, filtres, recherche et export.
 */
export default async function LivePage() {
  await requireAdminPage()

  const rows = await prisma.event.findMany({ orderBy: { id: 'desc' }, take: INITIAL_EVENTS })
  const ordered = rows.reverse()
  const organizations = await organizationNames(ordered.map((row) => row.organizationId))
  const events = ordered.map((row) => toWireEvent(row, row.organizationId ? organizations[row.organizationId] ?? null : null))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activité en direct"
        description={
          <>
            Déploiements, inscriptions et actions d’administration de toutes les organisations, au fil de l’eau. Les
            charges utiles sont filtrées côté serveur : aucun secret ne remonte ici. Les actions d’administration sont
            aussi détaillées dans le{' '}
            <Link href="/admin/audit" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
              journal d’audit
            </Link>
            .
          </>
        }
      />
      <LiveFeed initialEvents={events} initialOrganizations={organizations} />
    </div>
  )
}
