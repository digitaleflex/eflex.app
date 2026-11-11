import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowUpRight, ExternalLink, GitBranch, GitCommitHorizontal, Globe, KeyRound, Layers, Lock, Settings, ShieldAlert, ShieldCheck, Sparkles, Activity } from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { AutoRefresh } from '@/components/auto-refresh'
import { DeploymentLogs } from '@/components/deployment-logs'
import { RuntimeLogs } from '@/components/runtime-logs'
import { LiveRefresh } from '@/components/live-refresh'
import { FrameworkTile, DeployHistory } from '@/components/dashboard/project-card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { GithubMark } from '@/components/icons/github-mark'
import { RedeployButton } from '@/components/redeploy-button'
import { CancelDeploymentButton } from '@/components/cancel-deployment-button'
import { RollbackDeploymentButton } from '@/components/rollback-deployment-button'
import { canManageProjects } from '@/lib/organizations'
import { isCommitSha } from '@/lib/deployment-rollback'
import { confidenceLevel, frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import { statusInfo } from '@/lib/project-status'
import { applicationHealth, tlsHealth } from '@/lib/project-health'
import { getApplicationRuntime } from '@/lib/coolify'
import { relativeTime } from '@/lib/relative-time'
import { repoLabel } from '@/lib/repo'
import { cn } from '@/lib/utils'

type StoredAnalysis = { confidence?: number; reasons: string[]; warnings: string[]; commitSha?: string }

/** `Project.detection` est du JSON libre en base : on ne retient que ce qu'on sait afficher. */
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [])

function readAnalysis(value: unknown): StoredAnalysis | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return {
    confidence: typeof v.confidence === 'number' ? v.confidence : undefined,
    reasons: strings(v.reasons),
    warnings: [...strings(v.warnings), ...strings(v.deployWarnings)],
    commitSha: typeof v.commitSha === 'string' ? v.commitSha : undefined,
  }
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const TABS = [
  { id: 'overview', label: "Vue d'ensemble" },
  { id: 'deployments', label: 'Déploiements' },
  { id: 'variables', label: 'Variables' },
  { id: 'logs', label: 'Logs' },
] as const
type Tab = (typeof TABS)[number]['id']

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const { tab: tabParam } = await searchParams
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'overview'
  const org = await resolveOrganization(session)
  if (!org) notFound()
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    include: {
      envVars: { select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } },
      deployments: { orderBy: { createdAt: 'desc' }, take: 20 },
      domains: { orderBy: { createdAt: 'asc' } },
      // Applications du projet (lot C de D2) : liste minimale avec leur statut.
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: {
          deployments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { status: true, commitSha: true, createdAt: true },
          },
        },
      },
    },
  })
  if (!project) notFound()

  // Statut runtime Coolify (lecture courte : une page ne doit jamais attendre l'API).
  const runtime = project.coolifyAppId ? await getApplicationRuntime(project.coolifyAppId, 3_000) : null
  const runtimeStatus = project.coolifyAppId ? (runtime && !('error' in runtime) ? runtime.status : null) : null
  const runtimeError = runtime && 'error' in runtime ? runtime.error : null
  const appHealth = project.coolifyAppId
    ? applicationHealth(runtimeStatus)
    : { label: 'Pas encore déployé', detail: 'Le statut sera disponible après le premier déploiement.', tone: 'muted' as const }
  const certificateHealth = tlsHealth(project.tlsValid, project.tlsExpiresAt, project.tlsCheckedAt)

  // L'état des déploiements est écrit par le worker (file Redis) ; la page se met à jour par événements.
  const deployments = project.deployments
  const analysis = readAnalysis(project.detection)
  const storedPlan = project.plan as unknown as {
    framework?: string
    compose?: { services?: unknown }
  } | null
  const composeServices =
    storedPlan?.framework === 'compose' && Array.isArray(storedPlan.compose?.services)
      ? storedPlan.compose.services.filter((name): name is string => typeof name === 'string')
      : []
  const last = deployments[0]
  const production = deployments.find((d) => d.status === 'live')
  const inProgress = last !== undefined && statusInfo(last.status).inProgress
  const tabHref = (t: Tab) => `/dashboard/projects/${project.id}${t === 'overview' ? '' : `?tab=${t}`}`

  return (
    <div className="space-y-6">
      <AutoRefresh active={inProgress} />
      <LiveRefresh types={['deployment.created', 'deployment.status']} projectId={project.id} />

      {/* En-tête : identité du projet et actions principales */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <FrameworkTile framework={project.framework} name={project.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight">{project.name}</h1>
              <StatusPill status={last?.status} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <GithubMark className="h-3.5 w-3.5" />
              <span className="truncate">{repoLabel(project.repoUrl)}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canManageProjects(org.role) && last && statusInfo(last.status).inProgress && (
            <CancelDeploymentButton projectId={project.id} deploymentId={last.id} />
          )}
          {canManageProjects(org.role) && <RedeployButton projectId={project.id} />}
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
          >
            <GithubMark className="h-4 w-4" />
            Dépôt<span className="sr-only"> (nouvel onglet)</span>
          </a>
          {project.domain && (
            <a
              href={`https://${project.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11"
            >
              Visiter
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{project.domain} (nouvel onglet)</span>
            </a>
          )}
          {canManageProjects(org.role) && (
            <Link
              href={`/dashboard/projects/${project.id}/settings`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Paramètres
            </Link>
          )}
        </div>
      </header>

      <nav aria-label="Sections du projet" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium',
              tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.id === 'deployments' && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{deployments.length}</span>}
            {t.id === 'variables' && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{project.envVars.length}</span>}
          </Link>
        ))}
      </nav>

      {/* Statut du dernier déploiement : annoncé après chaque mise à jour temps réel. */}
      <p role="status" aria-live="polite" className="sr-only">
        {last ? `Dernier déploiement : ${statusInfo(last.status).label}.` : 'Aucun déploiement pour ce projet.'}
      </p>

      {/* Applications du projet (lot C de D2) : visible seulement en multi-app. */}
      {project.apps.length > 1 && (
        <section aria-labelledby="apps-title" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 id="apps-title" className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
              Applications
              <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                {project.apps.length}
              </span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Chaque application a son propre build, son dossier et son domaine. Le redéploiement
              global les relance ensemble.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Application</th>
                  <th scope="col" className="px-3 py-2 font-medium">Dossier</th>
                  <th scope="col" className="px-3 py-2 font-medium">Domaine</th>
                  <th scope="col" className="px-5 py-2 font-medium">Dernier déploiement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {project.apps.map((app) => {
                  const appLast = app.deployments[0]
                  return (
                    <tr key={app.id}>
                      <th scope="row" className="px-5 py-3 font-medium">
                        <span className="flex items-center gap-2">
                          {app.name}
                          {app.position === 0 && (
                            <span className="rounded-full border border-border px-1.5 text-[11px] font-normal text-muted-foreground">
                              Principale
                            </span>
                          )}
                        </span>
                      </th>
                      <td className="px-3 py-3">
                        <code className="font-mono text-xs text-muted-foreground">
                          {app.root === '' ? 'Racine du dépôt' : app.root}
                        </code>
                      </td>
                      <td className="px-3 py-3">
                        {app.domain ? (
                          <a
                            href={`https://${app.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                          >
                            {app.domain}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="sr-only">(nouvel onglet)</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Non exposée</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusPill status={appLast?.status} />
                          {appLast && (
                            <time dateTime={appLast.createdAt.toISOString()} className="text-xs text-muted-foreground">
                              {dateFormat.format(appLast.createdAt)}
                            </time>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Production : ce qui est en ligne maintenant. */}
          <section aria-labelledby="prod-title" className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="relative flex min-h-48 flex-col justify-between gap-6 overflow-hidden bg-eflexnavy p-6 text-white">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-eflexroyalblue/40 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-eflexsky/25 blur-3xl" />
                <p id="prod-title" className="relative text-xs font-semibold uppercase tracking-wider text-white/70">Production</p>
                <div className="relative min-w-0">
                  {project.domain ? (
                    <a href={`https://${project.domain}`} target="_blank" rel="noopener noreferrer" className="group inline-flex max-w-full items-center gap-2 font-display text-xl font-bold hover:underline sm:text-2xl">
                      <span className="truncate">{project.domain}</span>
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
                        ? <>Version en ligne : déploiement du <time dateTime={production.createdAt.toISOString()}>{dateFormat.format(production.createdAt)}</time>.</>
                        : last
                          ? 'Aucun déploiement réussi pour l’instant.'
                          : 'Ce projet n’a pas encore été déployé.'}
                  </p>
                  {project.domains.filter((item) => item.verifiedAt).length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Domaines personnalisés">
                      {project.domains.filter((item) => item.verifiedAt).map((item) => (
                        <li key={item.id}>
                          <a
                            href={`https://${item.hostname}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs text-white/85 hover:bg-white/20"
                          >
                            {item.hostname}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                {[
                  { icon: Globe, label: 'Statut', value: <StatusPill status={last?.status} /> },
                  { icon: GitBranch, label: 'Branche', value: <span className="font-mono text-sm">{project.branch}</span> },
                  {
                    icon: GitCommitHorizontal,
                    label: 'Dernier déploiement',
                    value: last ? (
                      <span className="text-sm">
                        <time dateTime={last.createdAt.toISOString()} suppressHydrationWarning>{relativeTime(last.createdAt)}</time>
                        {last.commitSha !== 'pending' && <span className="font-mono text-muted-foreground"> · {last.commitSha.slice(0, 7)}</span>}
                      </span>
                    ) : <span className="text-sm text-muted-foreground">—</span>,
                  },
                  {
                    icon: Layers,
                    label: 'Stack',
                    value: (
                      <span className="text-sm">
                        {project.framework ? frameworkLabel(project.framework) : 'Détection automatique'}
                        {project.runtime && <span className="text-muted-foreground"> · {runtimeLabel(project.runtime)}</span>}
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

          <section aria-labelledby="health-title" className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <h2 id="health-title" className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                Santé & sécurité
              </h2>
            </div>
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
          </section>

          <div className={cn('grid gap-6', analysis && 'lg:grid-cols-2')}>
            <section aria-labelledby="recent-title" className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 id="recent-title" className="text-sm font-semibold">Derniers déploiements</h2>
                <DeployHistory history={[...deployments].slice(0, 12).reverse().map((d) => d.status)} />
              </div>
              {deployments.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aucun déploiement pour ce projet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {deployments.slice(0, 4).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium"><time dateTime={d.createdAt.toISOString()}>{dateFormat.format(d.createdAt)}</time></p>
                        <p className="font-mono text-xs text-muted-foreground">{d.commitSha === 'pending' ? 'commit en attente' : d.commitSha.slice(0, 7)}</p>
                      </div>
                      <StatusPill status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={tabHref('deployments')} className="flex min-h-11 items-center justify-center border-t border-border text-sm font-medium text-primary hover:bg-muted">
                Tous les déploiements et leurs journaux
              </Link>
            </section>

            {analysis && (
              <section aria-labelledby="analysis-title" className="rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                  <h2 id="analysis-title" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />Comment Eflex a compris ce dépôt</h2>
                  {typeof analysis.confidence === 'number' && (
                    <span className="text-xs text-muted-foreground">
                      Confiance {confidenceLevel(analysis.confidence).label.toLowerCase()} · {Math.round(analysis.confidence * 100)} %
                    </span>
                  )}
                </div>
                <div className="space-y-4 px-5 py-4">
                  {analysis.reasons.length > 0 && (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {analysis.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {analysis.warnings.length > 0 && (
                    <div role="note" className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                      <p className="text-sm font-medium text-warning">À savoir</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-warning">
                        {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    </div>
                  )}
                  {analysis.commitSha && (
                    <p className="text-xs text-muted-foreground">Analysé sur le commit <code className="font-mono">{analysis.commitSha.slice(0, 7)}</code></p>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'deployments' && (
        <section aria-label="Déploiements" className="overflow-hidden rounded-xl border border-border bg-card">
          {deployments.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Aucun déploiement pour ce projet.</p>
          ) : (
            <>
              {canManageProjects(org.role) && (
                <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
                  « Redéployer cette version » reconstruit un déploiement réussi avec les variables
                  d’environnement actuelles. Les migrations de base de données ne sont pas annulées.
                </p>
              )}
              <ul className="divide-y divide-border">
                {deployments.map((d, i) => (
                  <li key={d.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <StatusPill status={d.status} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                          <span className="font-mono">{d.commitSha === 'pending' ? 'commit en attente' : d.commitSha.slice(0, 7)}</span>
                          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" />{project.branch}</span>
                          {i === 0 && <span className="rounded-full border border-border px-1.5 text-[11px] font-medium text-muted-foreground">Dernier</span>}
                          {production?.id === d.id && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">Production</span>}
                        </p>
                        {d.status === 'failed' && d.logsSummary && <p className="mt-1 line-clamp-2 break-words text-xs text-destructive">{d.logsSummary}</p>}
                      </div>
                      <time dateTime={d.createdAt.toISOString()} className="text-xs text-muted-foreground">{dateFormat.format(d.createdAt)}</time>
                      {canManageProjects(org.role) && !inProgress && d.status === 'live' && isCommitSha(d.commitSha) && (
                        <RollbackDeploymentButton
                          projectId={project.id}
                          deploymentId={d.id}
                          commitSha={d.commitSha}
                          createdAtLabel={dateFormat.format(d.createdAt)}
                        />
                      )}
                      {canManageProjects(org.role) && statusInfo(d.status).inProgress && (
                        <CancelDeploymentButton projectId={project.id} deploymentId={d.id} />
                      )}
                    </div>
                    <DeploymentLogs projectId={project.id} deploymentId={d.id} defaultOpen={d.id === last?.id && inProgress} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === 'variables' && (
        <section aria-labelledby="vars-title" className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="vars-title" className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" aria-hidden="true" />Variables d&apos;environnement</h2>
              {canManageProjects(org.role) && (
                <Link
                  href={`/dashboard/projects/${project.id}/settings`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Modifier
                </Link>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Les valeurs ne quittent jamais le serveur et sont masquées dans les journaux. Une modification s’applique au prochain déploiement.
            </p>
          </div>
          {project.envVars.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune variable définie pour ce projet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {project.envVars.map((v) => (
                <li key={v.key} className="flex items-center justify-between gap-3 px-5 py-3">
                  <code className="truncate font-mono text-sm">{v.key}</code>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm tracking-widest text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />••••••••
                    <span className="sr-only">valeur masquée</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'logs' &&
        (project.coolifyAppId ? (
          <RuntimeLogs projectId={project.id} services={composeServices} />
        ) : (
          <section aria-labelledby="logs-title" className="rounded-xl border border-border bg-card p-6">
            <h2 id="logs-title" className="font-semibold">Journaux d’exécution</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Les journaux seront disponibles après le premier déploiement du projet.
            </p>
          </section>
        ))}
    </div>
  )
}
