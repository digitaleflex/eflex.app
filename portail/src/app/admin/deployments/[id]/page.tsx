import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CircleAlert, Clock, GitCommitHorizontal, Layers } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/dashboard/status-pill'
import { AdminDeploymentActions } from '@/components/admin/deployment-actions'
import { AdminDeploymentLogs } from '@/components/admin/deployment-logs-panel'
import { maskProjectLogs } from '@/lib/admin-deployment-logs'
import { frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import { STATUS_LABELS, isDeploymentStatus } from '@/lib/deployment-state'
import { relativeTime } from '@/lib/relative-time'
import { getPrimaryApp } from '@/lib/project-apps'
import {
  deploymentDuration,
  isActiveDeploymentStatus,
  probableFailureCause,
  summarizePlan,
} from '@/lib/admin-projects'

export const metadata = { title: 'Déploiement — Administration Eflex' }
export const dynamic = 'force-dynamic'

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'medium' })

export default async function AdminDeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const now = new Date()

  const deployment = await prisma.deployment.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      commitSha: true,
      status: true,
      coolifyBuildId: true,
      logsSummary: true,
      createdAt: true,
      app: {
        select: { id: true, name: true, framework: true, runtime: true, domain: true, plan: true },
      },
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          organization: { select: { id: true, name: true } },
          envVars: { select: { key: true, value: true } },
          apps: {
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true, framework: true, runtime: true, domain: true, plan: true },
          },
        },
      },
    },
  })
  if (!deployment) notFound()

  const primary = getPrimaryApp(deployment.project.apps)
  const app = deployment.app ?? primary
  const plan = summarizePlan(app?.plan)
  const summary = maskProjectLogs(deployment.project.id, deployment.project.envVars, deployment.logsSummary)
  const cause = deployment.status === 'failed' ? probableFailureCause(summary) : null
  const timing = deploymentDuration(deployment, now)
  const active = isActiveDeploymentStatus(deployment.status)
  const statusLabel = isDeploymentStatus(deployment.status) ? STATUS_LABELS[deployment.status] : deployment.status

  return (
    <div className="space-y-6">
      <Link href="/admin/deployments" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        File des déploiements
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Déploiement</h1>
          <StatusPill status={deployment.status} />
          {active && <Badge variant="warning">Actif</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/admin/projects/${deployment.project.id}`} className="font-medium text-foreground hover:underline">
            {deployment.project.name}
          </Link>{' '}
          · {deployment.project.organization.name}
          {app ? ` · ${app.name}` : ''} · créé{' '}
          <time dateTime={deployment.createdAt.toISOString()}>{relativeTime(deployment.createdAt, now)}</time>
        </p>
        <p className="flex items-center gap-1.5 break-all font-mono text-sm">
          <GitCommitHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {deployment.commitSha}
        </p>
      </header>

      {active && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Intervention</h2>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            Débloquer interrompt le déploiement et le passe en échec ; annuler conserve un état « Annulé ». Les deux
            actions sont auditées.
          </p>
          <AdminDeploymentActions projectId={deployment.project.id} deploymentId={deployment.id} active={active} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            Chronologie
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Statut</dt>
              <dd>{statusLabel}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Créé le</dt>
              <dd className="tabular-nums">{dateTime.format(deployment.createdAt)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Durée</dt>
              <dd>{timing.label}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Build hébergement</dt>
              <dd className="break-all font-mono text-xs">{deployment.coolifyBuildId ?? 'Aucun'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Identifiant</dt>
              <dd className="break-all font-mono text-xs">{deployment.id}</dd>
            </div>
          </dl>
          {timing.detail && <p className="mt-2 text-xs text-muted-foreground">{timing.detail}</p>}
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CircleAlert className="h-4 w-4 text-primary" aria-hidden="true" />
            Cause probable de l’échec
          </h2>
          {deployment.status !== 'failed' ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Ce déploiement n’est pas en échec : aucune cause à analyser.
            </p>
          ) : cause ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-medium">{cause.label}</p>
              <p className="text-muted-foreground">{cause.detail}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Cause non identifiée automatiquement. Consultez les journaux ci-dessous : les dernières lignes indiquent
              la commande fautive.
            </p>
          )}
          {deployment.status === 'failed' && (
            <p className="mt-3 text-xs text-muted-foreground">
              Déduction automatique à partir de l’extrait de journal (secrets masqués). Elle peut être incomplète.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          Plan retenu (BuildPlan)
        </h2>
        {plan ? (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Application</dt>
              <dd>{app?.name ?? '—'}{app?.domain ? ` · ${app.domain}` : ''}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Stack</dt>
              <dd>{frameworkLabel(app?.framework ?? plan.framework)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Runtime</dt>
              <dd>{(app?.runtime ?? plan.runtime) ? runtimeLabel((app?.runtime ?? plan.runtime) as string) : '—'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Racine</dt>
              <dd className="font-mono text-xs">{plan.root === '' ? '(dépôt)' : plan.root}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Port</dt>
              <dd className="tabular-nums">{plan.port ?? '—'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Dossier publié</dt>
              <dd className="font-mono text-xs">{plan.publish ?? '—'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
              <dt className="text-muted-foreground">Dockerfile</dt>
              <dd className="font-mono text-xs">{plan.dockerfile ?? (plan.framework === 'docker' ? 'Dockerfile' : '—')}</dd>
            </div>
            {[
              { label: 'Installation', value: plan.install },
              { label: 'Construction', value: plan.build },
              { label: 'Démarrage', value: plan.start },
              { label: 'Healthcheck', value: plan.healthcheck },
            ].map((row) => (
              <div key={row.label} className="flex flex-wrap justify-between gap-2 sm:col-span-2">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="max-w-full break-all text-right font-mono text-xs">{row.value ?? '—'}</dd>
              </div>
            ))}
            {plan.services.length > 1 && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Services</dt>
                <dd className="mt-1 space-y-1 font-mono text-xs">
                  {plan.services.map((service) => (
                    <p key={service.name} className="break-all">
                      {service.name} : {service.command}
                    </p>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Plan indisponible : aucune application ou BuildPlan enregistré pour ce déploiement.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Plan de l’application déployée (ou de l’application principale si l’historique ne précise pas l’application).
        </p>
      </Card>

      <Card className="p-4">
        <AdminDeploymentLogs
          projectId={deployment.project.id}
          deploymentId={deployment.id}
          storedSummary={summary}
          hasBuild={Boolean(deployment.coolifyBuildId)}
        />
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`/admin/projects/${deployment.project.id}`} className="min-h-11 content-center font-medium text-primary hover:underline">
          Fiche du projet
        </Link>
        <Link href={`/admin/deployments?projet=${deployment.project.id}`} className="min-h-11 content-center font-medium text-primary hover:underline">
          Déploiements de ce projet
        </Link>
      </div>
    </div>
  )
}
