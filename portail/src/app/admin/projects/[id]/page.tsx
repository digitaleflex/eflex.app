import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, Globe, Layers, Server, ShieldAlert, ShieldCheck } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/dashboard/status-pill'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { AdminProjectActions } from '@/components/admin/project-actions'
import { frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import { applicationHealth, tlsHealth } from '@/lib/project-health'
import { getApplicationRuntime } from '@/lib/coolify'
import { relativeTime } from '@/lib/relative-time'
import { repoLabel } from '@/lib/repo'
import { deploymentDuration } from '@/lib/admin-projects'
import { ACTIVE_DEPLOYMENT_STATUSES } from '@/lib/deployment-state'

export const metadata = { title: 'Projet — Administration Eflex' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const now = new Date()

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      repoUrl: true,
      repoFullName: true,
      branch: true,
      productionBranch: true,
      framework: true,
      runtime: true,
      domain: true,
      coolifyAppId: true,
      tlsValid: true,
      tlsExpiresAt: true,
      tlsCheckedAt: true,
      createdAt: true,
      organization: { select: { id: true, name: true, slug: true } },
      deployments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, commitSha: true, status: true, createdAt: true },
      },
      domains: { orderBy: { createdAt: 'asc' }, select: { id: true, hostname: true, verifiedAt: true } },
      _count: { select: { envVars: true } },
    },
  })
  if (!project) notFound()

  const [active, runtime] = await Promise.all([
    prisma.deployment.findFirst({
      where: { projectId: project.id, status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    }),
    project.coolifyAppId ? getApplicationRuntime(project.coolifyAppId, 3_000) : Promise.resolve(null),
  ])
  const runtimeStatus = runtime && !('error' in runtime) ? runtime.status : null
  const runtimeError = runtime && 'error' in runtime ? runtime.error : null
  const health = project.coolifyAppId
    ? applicationHealth(runtimeStatus)
    : { label: 'Pas encore déployé', detail: 'Aucune application sur l’infrastructure.', tone: 'muted' as const }
  const certificate = tlsHealth(project.tlsValid, project.tlsExpiresAt, project.tlsCheckedAt, now.getTime())
  const last = project.deployments[0] ?? null

  return (
    <div className="space-y-6">
      <Link href="/admin/projects" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tous les projets
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <FrameworkTile framework={project.framework} name={project.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight">{project.name}</h1>
              <StatusPill status={last?.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {project.organization.name} · <span className="font-mono">{project.slug}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Dépôt<span className="sr-only"> (nouvel onglet)</span>
          </a>
          {project.domain && (
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              Site<span className="sr-only"> {project.domain} (nouvel onglet)</span>
            </a>
          )}
        </div>
      </header>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Opérations</h2>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">
          Actions réservées aux administrateurs ; chacune est enregistrée dans le journal d’audit avec son motif.
        </p>
        <AdminProjectActions
          projectId={project.id}
          projectName={project.name}
          hasApplication={Boolean(project.coolifyAppId)}
          activeDeploymentId={active?.id ?? null}
          activeDeploymentStatus={active?.status ?? null}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            Identité et configuration
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Organisation</dt>
              <dd>{project.organization.name}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Dépôt</dt>
              <dd className="break-all text-right">{project.repoFullName ?? repoLabel(project.repoUrl)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Branche de production</dt>
              <dd className="font-mono text-xs">{project.productionBranch ?? project.branch}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Stack</dt>
              <dd>
                {frameworkLabel(project.framework)}
                {project.runtime ? ` · ${runtimeLabel(project.runtime)}` : ''}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Domaine principal</dt>
              <dd>{project.domain ?? '—'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Domaine(s) personnalisé(s)</dt>
              <dd>{project.domains.length === 0 ? '—' : project.domains.map((domain) => domain.hostname).join(', ')}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Variables d’environnement</dt>
              <dd>
                {project._count.envVars} <span className="text-xs text-muted-foreground">(valeurs jamais affichées)</span>
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Créé le</dt>
              <dd>{dateFormat.format(project.createdAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4 text-primary" aria-hidden="true" />
            Infrastructure
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted-foreground">Application Coolify</dt>
              <dd className="break-all font-mono text-xs">{project.coolifyAppId ?? 'Aucune'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Statut runtime</dt>
              <dd>{health.label}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Certificat</dt>
              <dd className="flex items-center gap-1.5">
                {certificate.tone === 'success' ? (
                  <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                {certificate.label}
              </dd>
            </div>
          </dl>
          {certificate.detail && <p className="mt-2 text-xs text-muted-foreground">{certificate.detail}</p>}
          {runtimeError && (
            <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              Statut runtime indisponible : {runtimeError}
            </p>
          )}
          {!project.coolifyAppId && (
            <p className="mt-3 text-xs text-muted-foreground">
              Aucune application sur l’infrastructure : un déploiement la créera.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="text-sm font-semibold">Derniers déploiements</h2>
          <Link href={`/admin/deployments?projet=${project.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">
            Voir la file et l’historique
          </Link>
        </div>
        {project.deployments.length === 0 ? (
          <p className="p-4 pt-0 text-sm text-muted-foreground">Aucun déploiement pour ce projet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {project.deployments.map((deployment) => {
              const timing = deploymentDuration(deployment, now)
              return (
                <li key={deployment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <StatusPill status={deployment.status} />
                      <span className="font-mono text-xs text-muted-foreground">{deployment.commitSha.slice(0, 10)}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <time dateTime={deployment.createdAt.toISOString()}>{relativeTime(deployment.createdAt, now)}</time>
                      {' · '}
                      {timing.label}
                    </p>
                  </div>
                  <Link
                    href={`/admin/deployments/${deployment.id}`}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0"
                  >
                    Détail<span className="sr-only"> du déploiement {deployment.commitSha.slice(0, 10)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Les valeurs des variables d’environnement ne sont jamais affichées dans la console d’administration. Pour agir sur
        la configuration du projet, utilisez la console client avec un compte membre de l’organisation.
      </p>
      {project.tlsValid === false && <Badge variant="destructive">Certificat invalide au dernier contrôle</Badge>}
    </div>
  )
}
