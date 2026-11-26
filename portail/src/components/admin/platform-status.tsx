import Link from 'next/link'
import { collectInfrastructure } from '@/app/admin/infrastructure/collect'
import { LevelBadge } from '@/components/admin/infrastructure-level'
import { Card, CardContent } from '@/components/ui/card'
import { prisma } from '@/lib/prisma'
import { buildPlatformStatus } from '@/lib/platform-status'

const DAY_MS = 86_400_000

/** « État de la plateforme » : un coup d'œil sur les signaux, chacun menant à son détail. */
export async function PlatformStatus() {
  const since = new Date(Date.now() - DAY_MS)
  const [infra, failedDeployments24h, openSiteIncidents, databasesWithoutBackup] = await Promise.all([
    collectInfrastructure().catch((error) => {
      console.error('[PlatformStatus] Collecte d’infrastructure indisponible', error)
      return null
    }),
    prisma.deployment.count({ where: { status: 'failed', createdAt: { gte: since } } }),
    prisma.projectSiteIncident.count({ where: { status: 'open' } }),
    prisma.projectDatabase.count({ where: { kind: 'postgresql', backupId: null } }),
  ])

  const status = buildPlatformStatus({
    infrastructure: infra?.sources
      ? infra.sources.map((source) => ({
          key: source.key,
          label: source.label,
          level: source.level,
          detail: source.error,
        }))
      : null,
    failedDeployments24h,
    openSiteIncidents,
    databasesWithoutBackup,
  })

  return (
    <section aria-labelledby="platform-status-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="platform-status-title" className="text-lg font-semibold">
          État de la plateforme
        </h2>
        <LevelBadge level={status.overall} />
      </div>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {status.rows.map((row) => (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">{row.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground">{row.detail}</span>
                    <LevelBadge level={row.level} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}
