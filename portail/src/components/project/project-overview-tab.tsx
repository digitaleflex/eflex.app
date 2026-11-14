import Link from 'next/link'
import {
  Activity,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { DeployHistory } from '@/components/dashboard/project-card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { SectionCard } from '@/components/dashboard/section'
import { Notice } from '@/components/dashboard/notice'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectMetrics } from '@/components/project-metrics'
import { confidenceLevel, frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import { projectTabHref } from '@/lib/project-tabs'
import { relativeTime } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export type StoredAnalysis = { confidence?: number; reasons: string[]; warnings: string[]; commitSha?: string }

export type OverviewDeployment = {
  id: string
  status: string
  commitSha: string
  createdAt: Date
  app: { name: string } | null
}

export type OverviewDomain = {
  id: string
  hostname: string
}

export type HealthInfo = { label: string; detail?: string | null; tone: 'success' | 'warning' | 'danger' | 'muted' }

export function ProjectOverviewTab({
  projectId,
  branch,
  canManage,
  multiApp,
  deployed,
  primaryDomain,
  primaryFramework,
  primaryRuntime,
  deployments,
  last,
  production,
  principalDomains,
  pendingDomains,
  analysis,
  appHealth,
  runtimeError,
  certificateHealth,
  metricsApps,
}: {
  projectId: string
  branch: string
  canManage: boolean
  multiApp: boolean
  deployed: boolean
  primaryDomain: string | null
  primaryFramework: string | null
  primaryRuntime: string | null
  deployments: readonly OverviewDeployment[]
  last: OverviewDeployment | undefined
  production: { id: string; createdAt: Date; app: { name: string } | null } | null | undefined
  principalDomains: readonly OverviewDomain[]
  pendingDomains: readonly OverviewDomain[]
  analysis: StoredAnalysis | null
  appHealth: HealthInfo
  runtimeError: string | null
  certificateHealth: HealthInfo
  metricsApps: { id: string; name: string }[]
}) {
  const deploymentsHref = projectTabHref(projectId, 'deployments')

  return (
    <div className="space-y-6">
      <section aria-labelledby="prod-title" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="relative flex min-h-48 flex-col justify-between gap-6 overflow-hidden bg-eflexnavy p-6 text-white">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-eflexroyalblue/40 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-eflexsky/25 blur-3xl" />
            <h2 id="prod-title" className="relative text-xs font-semibold uppercase tracking-wider text-white/70">Production</h2>
            <div className="relative min-w-0">
              {primaryDomain ? (
                <a href={`https://${primaryDomain}`} target="_blank" rel="noopener noreferrer" className="group inline-flex max-w-full items-center gap-2 font-display text-xl font-bold hover:underline sm:text-2xl">
                  <span className="truncate">{primaryDomain}</span>
                  <ExternalLink className="h-5 w-5 shrink-0 opacity-70" aria-hidden="true" />
                  <span className="sr-only">(nouvel onglet)</span>
                </a>
              ) : (
                <p className="font-display text-xl font-bold">Pas encore de domaine</p>
              )}
              <p className="mt-2 text-sm text-white/75">
                {production && last && last.id !== production.id && last.status === 'failed'
                  ? <>Le dernier déploiement a échoué. La version du <time dateTime={production.createdAt.toISOString()}>{dateFormat.format(production.createdAt)}</time> reste celle en ligne.</>
                  : production
                    ? <>Version en ligne : déploiement du <time dateTime={production.createdAt.toISOString()}>{dateFormat.format(production.createdAt)}</time>{production.app ? ` (${production.app.name})` : ''}.</>
                    : last
                      ? 'Aucun déploiement réussi pour l’instant.'
                      : 'Ce projet n’a pas encore été déployé.'}
              </p>
              {principalDomains.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Domaines personnalisés">
                  {principalDomains.map((domain) => (
                    <li key={domain.id}>
                      <a
                        href={`https://${domain.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs text-white/85 hover:bg-white/20"
                      >
                        {domain.hostname}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {pendingDomains.length > 0 && (
                <p className="mt-3 text-xs text-white/70">
                  {pendingDomains.length} domaine{pendingDomains.length > 1 ? 's' : ''} en attente de vérification DNS.
                  {canManage && (
                    <>
                      {' '}
                      <Link href={`/dashboard/projects/${projectId}/settings#domaines`} className="font-medium text-white underline underline-offset-2">
                        Configurer
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
            {[
              { icon: Globe, label: 'Statut', value: <StatusPill status={last?.status} /> },
              { icon: GitBranch, label: 'Branche', value: <span className="font-mono text-sm">{branch}</span> },
              {
                icon: GitCommitHorizontal,
                label: 'Dernier déploiement',
                value: last ? (
                  <span className="text-sm">
                    <time dateTime={last.createdAt.toISOString()} suppressHydrationWarning>{relativeTime(last.createdAt)}</time>
                    {last.commitSha !== 'pending' && <span className="font-mono text-muted-foreground"> · {last.commitSha.slice(0, 7)}</span>}
                    {last.app && multiApp && <span className="text-muted-foreground"> · {last.app.name}</span>}
                  </span>
                ) : <span className="text-sm text-muted-foreground">—</span>,
              },
              {
                icon: Layers,
                label: 'Stack',
                value: (
                  <span className="text-sm">
                    {primaryFramework ? frameworkLabel(primaryFramework) : 'Détection automatique'}
                    {primaryRuntime && <span className="text-muted-foreground"> · {runtimeLabel(primaryRuntime)}</span>}
                  </span>
                ),
              },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col gap-1.5 bg-card p-5">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <SectionCard
        id="health"
        title="Santé & sécurité"
        icon={Activity}
        description="Dernier statut connu de l’hébergement et du certificat, sans garantie de disponibilité en temps réel."
      >
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span
                aria-hidden="true"
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  appHealth.tone === 'success' && 'bg-success',
                  appHealth.tone === 'warning' && 'bg-warning',
                  appHealth.tone === 'danger' && 'bg-destructive',
                  appHealth.tone === 'muted' && 'bg-muted-foreground/50',
                )}
              />
              Application
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {appHealth.label}
              {appHealth.detail && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{appHealth.detail}</span>}
              {runtimeError && <span className="mt-1 block text-xs font-normal text-warning">Hébergement : {runtimeError}</span>}
            </dd>
          </div>
          <div className="p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {certificateHealth.tone === 'success' ? (
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              ) : certificateHealth.tone === 'danger' ? (
                <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              )}
              Certificat HTTPS
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {certificateHealth.label}
              {certificateHealth.detail && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{certificateHealth.detail}</span>}
            </dd>
          </div>
        </dl>
      </SectionCard>

      {deployed ? (
        <ProjectMetrics projectId={projectId} apps={multiApp ? metricsApps : []} />
      ) : (
        <section
          aria-labelledby="project-metrics-title"
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 id="project-metrics-title" className="flex items-center gap-2 text-base font-semibold">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              Ressources
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Les métriques CPU et mémoire seront disponibles après le premier déploiement.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Métriques CPU/mémoire indisponibles : aucune application déployée pour le moment. Aucune valeur estimée n’est affichée.
            </p>
          </div>
        </section>
      )}

      <div className={cn('grid gap-6', analysis && 'lg:grid-cols-2')}>
        <SectionCard
          id="recent"
          title="Derniers déploiements"
          actions={<DeployHistory history={[...deployments].slice(0, 12).reverse().map((deployment) => deployment.status)} />}
        >
          {deployments.length === 0 ? (
            <EmptyState
              title="Aucun déploiement pour ce projet"
              description="Le premier déploiement apparaîtra ici avec son statut et ses journaux."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-border">
              {deployments.slice(0, 4).map((deployment) => (
                <li key={deployment.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                      <time dateTime={deployment.createdAt.toISOString()} suppressHydrationWarning>
                        {relativeTime(deployment.createdAt)}
                      </time>
                      {deployment.app && multiApp && (
                        <span className="rounded-full border border-border px-1.5 text-xs font-normal text-muted-foreground">
                          {deployment.app.name}
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {deployment.commitSha === 'pending' ? 'commit en attente' : deployment.commitSha.slice(0, 7)}
                    </p>
                  </div>
                  <StatusPill status={deployment.status} />
                </li>
              ))}
            </ul>
          )}
          <Link href={deploymentsHref} className="flex min-h-11 items-center justify-center border-t border-border text-sm font-medium text-primary hover:bg-muted">
            Tous les déploiements et leurs journaux
          </Link>
        </SectionCard>

        {analysis && (
          <SectionCard
            id="analysis"
            title="Détection du dépôt"
            icon={Sparkles}
            description="EFLEX déduit la stack des fichiers du dépôt. Le niveau de confiance est une estimation, pas une garantie : les points signalés expliquent les échecs possibles."
            actions={
              typeof analysis.confidence === 'number' ? (
                <span className="text-xs text-muted-foreground" title="Estimation calculée à partir des fichiers reconnus">
                  Estimation : {confidenceLevel(analysis.confidence).label.toLowerCase()} ·{' '}
                  <span className="tabular-nums">{Math.round(analysis.confidence * 100)} %</span>
                </span>
              ) : undefined
            }
          >
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {analysis.reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Ce qu’EFLEX a reconnu</p>
                  <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                    {analysis.reasons.map((reason, index) => (
                      <li key={`${index}-${reason}`} className="flex gap-2">
                        <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.warnings.length > 0 && (
                <Notice tone="warning" title="Points à vérifier">
                  <p className="mb-1.5 text-xs text-foreground/70">
                    Ces remarques ne bloquent pas le déploiement, mais peuvent expliquer un build en échec.
                  </p>
                  <ul className="space-y-1">
                    {analysis.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
                  </ul>
                </Notice>
              )}
              {analysis.commitSha && (
                <p className="text-xs text-muted-foreground">
                  Analysé sur le commit <code className="font-mono">{analysis.commitSha.slice(0, 7)}</code>
                </p>
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  )
}
