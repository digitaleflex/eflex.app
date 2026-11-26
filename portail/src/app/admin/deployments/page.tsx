import Link from 'next/link'
import { History, ListOrdered, Server, TimerReset, X } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { UnblockDeploymentButton } from '@/components/admin/unblock-deployment-button'
import { LiveRefresh } from '@/components/live-refresh'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'
import { deploymentTimeoutMs } from '@/lib/deployment-watchdog'
import { relativeTime } from '@/lib/relative-time'
import { deploymentsQueue, getDeploymentQueueDiagnosticsBatch } from '@/lib/queue'
import { normalizeQueueCounts } from '@/lib/infrastructure-health'
import { formatInteger } from '@/lib/table'
import {
  deploymentDuration,
  formatDuration,
  stuckBefore,
} from '@/lib/admin-projects'

export const metadata = { title: 'Déploiements — Administration' }
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

  const [queueCounts, queueDiagnostics] = await Promise.all([
    process.env.REDIS_URL
      ? deploymentsQueue()
          .getJobCounts()
          .then(normalizeQueueCounts)
          .catch(() => null)
      : Promise.resolve(null),
    getDeploymentQueueDiagnosticsBatch(active.map((deployment) => deployment.id)),
  ])
  const number = new Intl.NumberFormat('fr-FR')

  const queueStateLabel: Record<string, string> = {
    waiting: 'en attente',
    delayed: 'différé',
    prioritized: 'priorisé',
    active: 'actif',
    'waiting-children': 'en attente (dépendances)',
    completed: 'terminé (BullMQ)',
    failed: 'en échec (BullMQ)',
    missing: 'absent de la file',
    unknown: 'état inconnu',
  }

  const stuckCount = active.filter((deployment) => deployment.createdAt.getTime() <= threshold.getTime()).length
  const queueUnavailable = !queueCounts

  return (
    <div className="space-y-6">
      <LiveRefresh types={['deployment.created', 'deployment.status']} />

      <PageHeader
        title="Déploiements"
        description={`File d’attente temps réel et historique récent, toutes organisations. Un déploiement actif depuis plus de ${stuckMinutes} minutes est signalé comme bloqué.`}
        actions={<LinkButton href="/admin/projects">Tous les projets</LinkButton>}
      />

      {projectId ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Contexte du filtre</h2>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Historique limité au projet</span>
                <Badge variant="outline">{project?.name ?? 'Projet inconnu'}</Badge>
              </p>
            </div>
            <LinkButton href="/admin/deployments">
              <X className="h-4 w-4" aria-hidden="true" />
              Retirer le filtre
            </LinkButton>
          </div>
        </Card>
      ) : null}

      <section aria-label="Indicateurs des déploiements" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Déploiements actifs"
          value={formatInteger(active.length)}
          hint="File d’attente enregistrée en base (100 premiers affichés)."
          icon={ListOrdered}
          tone={active.length === 0 ? 'positive' : 'warning'}
        />
        <StatCard
          label="Déploiements bloqués"
          value={formatInteger(stuckCount)}
          hint={`Actifs depuis plus de ${stuckMinutes} minutes.`}
          icon={TimerReset}
          tone={stuckCount > 0 ? 'critical' : 'neutral'}
        />
        <StatCard
          label="Jobs en attente (BullMQ)"
          value={queueCounts ? formatInteger(queueCounts.waiting) : '—'}
          hint={queueCounts ? 'Indicateur interne du worker au chargement.' : 'Redis/BullMQ indisponible.'}
          icon={Server}
          tone={queueUnavailable ? 'neutral' : queueCounts.waiting > 0 ? 'warning' : 'positive'}
        />
        <StatCard
          label="Historique affiché"
          value={formatInteger(recent.length)}
          hint={projectId ? '50 derniers déploiements du projet filtré.' : '50 derniers déploiements, toutes organisations.'}
          icon={History}
          tone="info"
        />
      </section>

      <Card>
        <div className="space-y-1 p-4 pb-2">
          <h2 className="text-sm font-semibold">État de la file (BullMQ / Redis)</h2>
          <p className="text-xs text-muted-foreground">Indicateurs internes du worker, factuels au moment du chargement.</p>
        </div>
        {queueCounts ? (
          <div className="space-y-3 p-4 pt-0 text-sm">
            <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="inline">En attente :</dt> <dd className="inline font-medium tabular-nums text-foreground">{number.format(queueCounts.waiting)}</dd></div>
              <div><dt className="inline">En cours :</dt> <dd className="inline font-medium tabular-nums text-foreground">{number.format(queueCounts.active)}</dd></div>
              <div><dt className="inline">Différés :</dt> <dd className="inline font-medium tabular-nums text-foreground">{number.format(queueCounts.delayed)}</dd></div>
              <div><dt className="inline">Échoués :</dt> <dd className="inline font-medium tabular-nums text-foreground">{number.format(queueCounts.failed)}</dd></div>
              <div><dt className="inline">Terminés :</dt> <dd className="inline font-medium tabular-nums text-foreground">{number.format(queueCounts.completed)}</dd></div>
              <div><dt className="inline">En pause :</dt> <dd className="inline font-medium tabular-nums text-foreground">{number.format(queueCounts.paused)}</dd></div>
            </dl>
            {(queueCounts.delayed > 0 || queueCounts.failed > 0) ? (
              <p className="text-xs text-muted-foreground">
                {queueCounts.delayed > 0 ? `${number.format(queueCounts.delayed)} job${queueCounts.delayed > 1 ? 's' : ''} différé${queueCounts.delayed > 1 ? 's' : ''} (nouvelle tentative ou délai programmé). ` : ''}
                {queueCounts.failed > 0 ? `${number.format(queueCounts.failed)} job${queueCounts.failed > 1 ? 's' : ''} en échec côté BullMQ après tentatives.` : ''}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="p-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Indisponible : Redis/BullMQ non configuré ou injoignable. Les statuts ci-dessous restent ceux enregistrés en base.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ListOrdered className="h-4 w-4 text-primary" aria-hidden="true" />
              File d’attente
            </h2>
            <p className="text-xs text-muted-foreground">Déploiements actifs, du plus ancien au plus récent (100 maximum).</p>
          </div>
          <Badge variant={active.length === 0 ? 'success' : 'warning'}>{formatInteger(active.length)}</Badge>
        </div>
        {active.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="Aucun déploiement actif"
            description="La file d’attente est vide pour le moment."
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {active.map((deployment) => {
              const stuck = deployment.createdAt.getTime() <= threshold.getTime()
              const queue = queueDiagnostics[deployment.id]
              const queueLabel = queue ? queueStateLabel[queue.state] ?? queue.state : null
              const queueAlert =
                queue &&
                (queue.state === 'missing' || queue.state === 'failed' || queue.state === 'delayed' || queue.stalled)
              return (
                <li key={deployment.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/admin/projects/${deployment.projectId}`} className="font-medium hover:underline">
                        {deployment.project.name}
                      </Link>
                      <StatusPill status={deployment.status} />
                      {stuck ? <Badge variant="destructive">Bloqué</Badge> : null}
                      {queueLabel ? (
                        <Badge variant={queueAlert ? 'destructive' : 'outline'}>File : {queueLabel}</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deployment.project.organization.name} ·{' '}
                      <span className="font-mono">{deployment.commitSha.slice(0, 10)}</span> · depuis{' '}
                      {formatDuration(now.getTime() - deployment.createdAt.getTime())}
                      {queue?.attemptsMade != null && queue.attemptsMax != null
                        ? ` · tentative ${queue.attemptsMade}/${queue.attemptsMax}`
                        : ''}
                    </p>
                    {queue?.failedReason ? (
                      <p className="text-xs text-destructive">Raison BullMQ : {queue.failedReason}</p>
                    ) : null}
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
        <div className="space-y-1 p-4 pb-2">
          <h2 className="text-sm font-semibold">50 derniers déploiements</h2>
          <p className="text-xs text-muted-foreground">
            {projectId ? 'Historique récent du projet filtré, du plus récent au plus ancien.' : 'Toutes issues confondues, du plus récent au plus ancien.'}
          </p>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={History}
            title="Aucun déploiement enregistré"
            description={projectId ? 'Ce projet n’a pas encore d’historique de déploiement.' : 'Aucun déploiement n’est encore enregistré.'}
            className="py-8"
          />
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
