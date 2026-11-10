import Link from 'next/link'
import { ArrowLeft, ListOrdered, X } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/dashboard/status-pill'
import { UnblockDeploymentButton } from '@/components/admin/unblock-deployment-button'
import { LiveRefresh } from '@/components/live-refresh'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { deploymentTimeoutMs } from '@/lib/deployment-watchdog'
import { relativeTime } from '@/lib/relative-time'
import {
  deploymentDuration,
  formatDuration,
  stuckBefore,
} from '@/lib/admin-projects'

export const metadata = { title: 'Déploiements — Administration Eflex' }
export const dynamic = 'force-dynamic'

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminDeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ projet?: string }>
}) {
  await requireAdminPage()
  const { projet } = await searchParams
  const projectId = typeof projet === 'string' && projet.length > 0 ? projet : null
  const now = new Date()
  const timeoutMs = deploymentTimeoutMs()
  const threshold = stuckBefore(now, timeoutMs)
  const stuckMinutes = Math.max(1, Math.round(timeoutMs / 60_000))
  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
    : null
  const [active, recent] = await Promise.all([
    prisma.deployment.findMany({
      where: { status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        projectId: true,
        status: true,
        commitSha: true,
        createdAt: true,
        project: { select: { name: true, organization: { select: { name: true } } } },
      },
    }),
    prisma.deployment.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        projectId: true,
        status: true,
        commitSha: true,
        createdAt: true,
        project: { select: { name: true, organization: { select: { name: true } } } },
      },
    }),
  ])

  const stuckCount = active.filter((deployment) => deployment.createdAt.getTime() <= threshold.getTime()).length

  return (
    <div className="space-y-6">
      <LiveRefresh types={['deployment.created', 'deployment.status']} />

      <Link href="/admin/projects" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tous les projets
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Déploiements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          File d’attente temps réel et historique récent, toutes organisations. Un déploiement actif depuis plus de{' '}
          {stuckMinutes} minutes est signalé comme bloqué.
        </p>
      </div>

      {projectId && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">Filtré sur {project?.name ?? 'un projet inconnu'}</Badge>
          <Link href="/admin/deployments" className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Retirer le filtre
          </Link>
        </p>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ListOrdered className="h-4 w-4 text-primary" aria-hidden="true" />
            File d’attente
          </h2>
          <Badge variant={active.length === 0 ? 'success' : 'warning'}>{active.length}</Badge>
        </div>
        {active.length === 0 ? (
          <p className="p-4 pt-0 text-sm text-muted-foreground">Aucun déploiement actif : la file est vide.</p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((deployment) => {
              const stuck = deployment.createdAt.getTime() <= threshold.getTime()
              return (
                <li key={deployment.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/admin/projects/${deployment.projectId}`} className="font-medium hover:underline">
                        {deployment.project.name}
                      </Link>
                      <StatusPill status={deployment.status} />
                      {stuck && <Badge variant="destructive">Bloqué</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deployment.project.organization.name} ·{' '}
                      <span className="font-mono">{deployment.commitSha.slice(0, 10)}</span> · depuis{' '}
                      {formatDuration(now.getTime() - deployment.createdAt.getTime())}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/deployments/${deployment.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0"
                    >
                      Détail<span className="sr-only"> du déploiement de {deployment.project.name}</span>
                    </Link>
                    <UnblockDeploymentButton
                      projectId={deployment.projectId}
                      deploymentId={deployment.id}
                      projectName={deployment.project.name}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="p-4 pb-2">
          <h2 className="text-sm font-semibold">50 derniers déploiements</h2>
          <p className="text-xs text-muted-foreground">Toutes issues confondues, du plus récent au plus ancien.</p>
        </div>
        {recent.length === 0 ? (
          <p className="p-4 pt-0 text-sm text-muted-foreground">Aucun déploiement enregistré.</p>
        ) : (
          <>
            <ul className="divide-y divide-border sm:hidden" aria-label="Derniers déploiements">
              {recent.map((deployment) => (
                <li key={deployment.id} className="space-y-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/projects/${deployment.projectId}`} className="font-medium hover:underline">
                      {deployment.project.name}
                    </Link>
                    <StatusPill status={deployment.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{deployment.project.organization.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{deployment.commitSha.slice(0, 10)}</span> ·{' '}
                    <time dateTime={deployment.createdAt.toISOString()}>{relativeTime(deployment.createdAt, now)}</time> ·{' '}
                    {deploymentDuration(deployment, now).label}
                  </p>
                  <Link
                    href={`/admin/deployments/${deployment.id}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                  >
                    Ouvrir le détail
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Derniers déploiements, toutes organisations</caption>
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Projet</th>
                    <th scope="col" className="px-4 py-3 font-medium">Commit</th>
                    <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                    <th scope="col" className="px-4 py-3 font-medium">Créé</th>
                    <th scope="col" className="px-4 py-3 font-medium">Durée</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">Détail</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recent.map((deployment) => (
                    <tr key={deployment.id}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/projects/${deployment.projectId}`} className="font-medium hover:underline">
                          {deployment.project.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{deployment.project.organization.name}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{deployment.commitSha.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={deployment.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <time dateTime={deployment.createdAt.toISOString()}>{dateTime.format(deployment.createdAt)}</time>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">{deploymentDuration(deployment, now).label}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/deployments/${deployment.id}`}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0"
                        >
                          Détail<span className="sr-only"> du déploiement {deployment.commitSha.slice(0, 10)}</span>
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

      <p className="text-xs text-muted-foreground">
        {stuckCount > 0
          ? `${stuckCount} déploiement${stuckCount > 1 ? 's' : ''} dépasse${stuckCount > 1 ? 'nt' : ''} le délai habituel. Le chien de garde les passera en échec ; vous pouvez aussi les débloquer immédiatement.`
          : 'Le chien de garde passe automatiquement en échec un déploiement bloqué au-delà du délai configuré.'}
      </p>
    </div>
  )
}
