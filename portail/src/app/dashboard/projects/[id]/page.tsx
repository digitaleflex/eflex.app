import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization, canManageProjects } from '@/lib/organizations'
import { AutoRefresh } from '@/components/auto-refresh'
import { DeploymentLogs } from '@/components/deployment-logs'
import { diagnoseFailure } from '@/lib/deployment-diagnosis'
import { RuntimeLogs } from '@/components/runtime-logs'
import { ProjectMetrics } from '@/components/project-metrics'
import { LiveRefresh } from '@/components/live-refresh'
import { FrameworkTile, DeployHistory } from '@/components/dashboard/project-card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { SectionCard } from '@/components/dashboard/section'
import { Notice } from '@/components/dashboard/notice'
import { GithubMark } from '@/components/icons/github-mark'
import { RedeployButton } from '@/components/redeploy-button'
import { CancelDeploymentButton } from '@/components/cancel-deployment-button'
import { RollbackDeploymentButton } from '@/components/rollback-deployment-button'
import { ProjectAppsSection } from '@/components/project-apps'
import { EmptyState } from '@/components/ui/empty-state'
import { isCommitSha } from '@/lib/deployment-rollback'
import { confidenceLevel, frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import { statusInfo } from '@/lib/project-status'
import { runtimeHealth, tlsHealth } from '@/lib/project-health'
import { nextProjectAction, projectSituation, type NextProjectAction } from '@/lib/project-actions'
import { getApplicationRuntime } from '@/lib/coolify'
import { getPrimaryApp } from '@/lib/project-apps'
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
  { id: 'overview', label: "Vue d'ensemble", short: 'Aperçu' },
  { id: 'deployments', label: 'Déploiements', short: 'Déploiements' },
  { id: 'variables', label: 'Variables', short: 'Variables' },
  { id: 'logs', label: 'Logs', short: 'Logs' },
] as const
type Tab = (typeof TABS)[number]['id']

const primaryLinkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11'
const secondaryLinkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11'
const smallLinkClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9'

/** Action prioritaire du projet : même emplacement et même style quel que soit l'état. */
function PrimaryAction({ action, projectId, multiApp }: { action: NextProjectAction; projectId: string; multiApp?: boolean }) {
  if (action.kind === 'deploy' || action.kind === 'redeploy') {
    const label = multiApp && action.kind === 'redeploy' ? 'Redéployer toutes les applications' : action.label
    return <RedeployButton projectId={projectId} variant="primary" label={label} />
  }
  if (action.kind === 'visit') {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={primaryLinkClass}>
        {action.label}
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    )
  }
  return (
    <Link href={action.href!} className={primaryLinkClass}>
      {action.kind === 'settings' ? (
        <Settings className="h-4 w-4" aria-hidden="true" />
      ) : (
        <TerminalSquare className="h-4 w-4" aria-hidden="true" />
      )}
      {action.label}
    </Link>
  )
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  const { tab: tabParam } = await searchParams
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'overview'
  const org = await resolveOrganization(session)
  if (!org) notFound()
  const [project, latestLiveDeployment] = await Promise.all([
    prisma.project.findFirst({
      where: { id, organizationId: org.organizationId },
      include: {
        envVars: { select: { key: true, updatedAt: true, appId: true }, orderBy: { key: 'asc' } },
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            status: true,
            commitSha: true,
            createdAt: true,
            logsSummary: true,
            app: { select: { id: true, name: true } },
          },
        },
        domains: { orderBy: { createdAt: 'asc' } },
        // Applications du projet : source principale (domaine, stack, runtime, TLS, hébergement).
        apps: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            root: true,
            position: true,
            framework: true,
            runtime: true,
            port: true,
            domain: true,
            coolifyAppId: true,
            plan: true,
            tlsValid: true,
            tlsExpiresAt: true,
            tlsCheckedAt: true,
            deployments: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { status: true, commitSha: true, createdAt: true },
            },
          },
        },
      },
    }),
    // La dernière version en ligne peut être plus ancienne que l'historique récent :
    // on la lit séparément pour ne jamais afficher « aucun déploiement réussi » à tort.
    prisma.deployment.findFirst({
      where: { projectId: id, status: 'live', project: { organizationId: org.organizationId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, commitSha: true, createdAt: true, app: { select: { name: true } } },
    }),
  ])
  if (!project) notFound()

  const primaryApp = getPrimaryApp(project.apps)
  const primaryDomain = primaryApp?.domain ?? null
  const primaryFramework = primaryApp?.framework ?? null
  const primaryRuntime = primaryApp?.runtime ?? null
  const primaryCoolifyAppId = primaryApp?.coolifyAppId ?? null
  const primaryTlsValid = primaryApp?.tlsValid ?? null
  const primaryTlsExpiresAt = primaryApp?.tlsExpiresAt ?? null
  const primaryTlsCheckedAt = primaryApp?.tlsCheckedAt ?? null
  const deployed = project.apps.some((app) => Boolean(app.coolifyAppId))

  // Statut runtime Coolify de l'application principale (lecture courte : une page ne doit jamais attendre l'API).
  const runtime = primaryCoolifyAppId ? await getApplicationRuntime(primaryCoolifyAppId, 3_000) : null
  const runtimeStatus = primaryCoolifyAppId ? (runtime && !('error' in runtime) ? runtime.status : null) : null
  const runtimeError = runtime && 'error' in runtime ? runtime.error : null
  const runtimeInfo = runtime && !('error' in runtime) ? runtime : null
  const appHealth = primaryCoolifyAppId
    ? runtimeHealth({
        status: runtimeStatus,
        healthCheckEnabled: runtimeInfo?.healthCheckEnabled,
        healthCheckPath: runtimeInfo?.healthCheckPath,
        restartCount: runtimeInfo?.restartCount ?? null,
        lastRestartAt: runtimeInfo?.lastRestartAt ?? null,
        restartReason: runtimeInfo?.restartReason ?? null,
      })
    : { label: 'Pas encore déployé', detail: 'Le statut sera disponible après le premier déploiement.', tone: 'muted' as const }
  const certificateHealth = tlsHealth(primaryTlsValid, primaryTlsExpiresAt, primaryTlsCheckedAt)

  // L'état des déploiements est écrit par le worker (file Redis) ; la page se met à jour par événements.
  const deployments = project.deployments
  const analysis = readAnalysis(project.detection)
  const primaryPlan = primaryApp?.plan as unknown as {
    framework?: string
    compose?: { services?: unknown }
  } | null
  const composeServices =
    primaryPlan?.framework === 'compose' && Array.isArray(primaryPlan.compose?.services)
      ? primaryPlan.compose.services.filter((name): name is string => typeof name === 'string')
      : []
  const metricsApps = project.apps.map((app) => ({ id: app.id, name: app.name }))

  const runtimeLogApps = project.apps.map((app) => {
    const appPlan = app.plan as unknown as { framework?: string; compose?: { services?: unknown } } | null
    const appServices =
      appPlan?.framework === 'compose' && Array.isArray(appPlan.compose?.services)
        ? appPlan.compose.services.filter((name): name is string => typeof name === 'string')
        : []
    return { id: app.id, name: app.name, services: appServices }
  })
  const last = deployments[0]
  const production = latestLiveDeployment ?? deployments.find((deployment) => deployment.status === 'live')
  const inProgress = last !== undefined && statusInfo(last.status).inProgress
  const canManage = canManageProjects(org.role)
  const multiApp = project.apps.length > 1
  const appNameById = new Map(project.apps.map((app) => [app.id, app.name]))
  const situation = projectSituation(last?.status, deployments.length > 0)
  const primaryAction = nextProjectAction({
    projectId: project.id,
    situation,
    domain: primaryDomain,
    canManage,
  })
  const principalDomains = project.domains.filter(
    (domain) => domain.verifiedAt && (domain.appId === null || domain.appId === primaryApp?.id),
  )
  const pendingDomains = project.domains.filter(
    (domain) => !domain.verifiedAt && (domain.appId === null || domain.appId === primaryApp?.id),
  )
  const tabHref = (value: Tab) => `/dashboard/projects/${project.id}${value === 'overview' ? '' : `?tab=${value}`}`

  return (
    <div className="space-y-6">
      <AutoRefresh active={inProgress} />
      <LiveRefresh types={['deployment.created', 'deployment.status']} projectId={project.id} />

      {/* En-tête : statut, domaine, puis action prioritaire selon l'état réel. */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <FrameworkTile framework={primaryFramework} name={project.name} size="lg" />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight">{project.name}</h1>
              <StatusPill status={last?.status} />
              {multiApp && (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {project.apps.length} applications
                </span>
              )}
            </div>
            {primaryDomain ? (
              <a
                href={`https://${primaryDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-foreground hover:underline"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{primaryDomain}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Pas encore de domaine public</p>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GithubMark className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{repoLabel(project.repoUrl)}</span>
              <span aria-hidden="true">·</span>
              <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono">{project.branch}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {primaryAction && <PrimaryAction action={primaryAction} projectId={project.id} multiApp={multiApp} />}
          {canManage && situation === 'failed' && <RedeployButton projectId={project.id} label={multiApp ? 'Tout redéployer' : 'Redéployer'} />}
          {canManage && situation === 'live' && primaryAction?.kind === 'visit' && <RedeployButton projectId={project.id} label={multiApp ? 'Tout redéployer' : 'Redéployer'} />}
          {canManage && last && statusInfo(last.status).inProgress && (
            <CancelDeploymentButton projectId={project.id} deploymentId={last.id} />
          )}
          <a href={project.repoUrl} target="_blank" rel="noopener noreferrer" className={secondaryLinkClass}>
            <GithubMark className="h-4 w-4" />
            Dépôt<span className="sr-only"> (nouvel onglet)</span>
          </a>
          {canManage && (
            <Link href={`/dashboard/projects/${project.id}/settings`} className={secondaryLinkClass}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Paramètres
            </Link>
          )}
        </div>
      </header>

      <nav
        aria-label="Sections du projet"
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:flex sm:gap-0 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0"
      >
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <Link
              key={item.id}
              href={tabHref(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mb-px sm:justify-start sm:rounded-none sm:border-b-2',
                active
                  ? 'bg-muted text-foreground sm:bg-transparent sm:border-foreground'
                  : 'text-muted-foreground hover:text-foreground sm:border-transparent',
              )}
            >
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.label}</span>
              {item.id === 'deployments' && (
                <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">{deployments.length}</span>
              )}
              {item.id === 'variables' && (
                <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">{project.envVars.length}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Statut du dernier déploiement : annoncé après chaque mise à jour temps réel. */}
      <p role="status" aria-live="polite" className="sr-only">
        {last ? `Dernier déploiement : ${statusInfo(last.status).label}.` : 'Aucun déploiement pour ce projet.'}
      </p>

      {/* La situation qui demande une décision, avec la sortie la plus directe. */}
      {situation === 'failed' && (
        <Notice
          tone="danger"
          icon={CircleAlert}
          title="Le dernier déploiement a échoué"
          actions={
            <>
              <Link href={tabHref('deployments')} className={primaryLinkClass}>
                <TerminalSquare className="h-4 w-4" aria-hidden="true" />
                Voir les journaux
              </Link>
              {canManage && <RedeployButton projectId={project.id} label={multiApp ? 'Tout redéployer' : 'Redéployer'} />}
            </>
          }
        >
          {production
            ? `La version du ${dateFormat.format(production.createdAt)} reste en ligne. Consultez le journal du dernier déploiement pour identifier la cause, puis relancez.`
            : 'Aucune version n’est en ligne pour l’instant. Consultez le journal du dernier déploiement, corrigez le dépôt, puis relancez.'}
        </Notice>
      )}

      {situation === 'in-progress' && last && (
        <Notice
          tone="warning"
          icon={Loader2}
          title="Déploiement en cours"
          actions={
            <Link href={tabHref('deployments')} className={primaryLinkClass}>
              <TerminalSquare className="h-4 w-4" aria-hidden="true" />
              Suivre les journaux
            </Link>
          }
        >
          {statusInfo(last.status).label}. La page se met à jour automatiquement ; le journal est
          disponible sans attendre la fin.
        </Notice>
      )}

      {situation === 'never' && (
        <Notice tone="info" icon={Rocket} title="Ce projet n’a pas encore été déployé">
          Le premier déploiement crée l’application, attribue un domaine et prépare le certificat HTTPS.
          {canManage
            ? ' Lancez-le depuis l’action principale en haut de page.'
            : ' Un propriétaire ou un administrateur peut lancer ce premier déploiement.'}
        </Notice>
      )}

      {situation === 'idle' && (
        <Notice tone="info" icon={Rocket} title="Dernier déploiement annulé">
          {production
            ? `La version du ${dateFormat.format(production.createdAt)} reste en ligne. Vous pouvez relancer un déploiement quand vous le souhaitez.`
            : 'Le dernier déploiement a été annulé. Vous pouvez le relancer quand vous le souhaitez.'}
        </Notice>
      )}

      {/* Applications du projet (lot C de D2) : visible seulement en multi-app. */}
      {multiApp && (
        <ProjectAppsSection
          projectId={project.id}
          canManage={canManage}
          apps={project.apps.map((app) => ({
            id: app.id,
            name: app.name,
            root: app.root,
            framework: app.framework,
            domain: app.domain,
            position: app.position,
            deployments: app.deployments.map((deployment) => ({
              status: deployment.status,
              commitSha: deployment.commitSha,
              createdAt: deployment.createdAt,
            })),
          }))}
          domains={project.domains.map((domain) => ({
            id: domain.id,
            hostname: domain.hostname,
            appId: domain.appId,
            verifiedAt: domain.verifiedAt,
          }))}
        />
      )}

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Production : ce qui est en ligne maintenant. */}
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
                          <Link href={`/dashboard/projects/${project.id}/settings#domaines`} className="font-medium text-white underline underline-offset-2">
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
                  { icon: GitBranch, label: 'Branche', value: <span className="font-mono text-sm">{project.branch}</span> },
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
            <ProjectMetrics projectId={project.id} apps={multiApp ? metricsApps : []} />
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
                  Métriques indisponibles : cette application n’a pas encore été déployée.
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
                            <span className="rounded-full border border-border px-1.5 text-[11px] font-normal text-muted-foreground">
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
              <Link href={tabHref('deployments')} className="flex min-h-11 items-center justify-center border-t border-border text-sm font-medium text-primary hover:bg-muted">
                Tous les déploiements et leurs journaux
              </Link>
            </SectionCard>

            {analysis && (
              <SectionCard
                id="analysis"
                title="Détection du dépôt"
                icon={Sparkles}
                description="Eflex déduit la stack des fichiers du dépôt. Le niveau de confiance est une estimation, pas une garantie : les points signalés expliquent les échecs possibles."
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
                      <p className="text-xs font-medium text-muted-foreground">Ce qu’Eflex a reconnu</p>
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
      )}

      {tab === 'deployments' && (
        <SectionCard
          id="deployments"
          title="Historique des déploiements"
          description={`${deployments.length} déploiement${deployments.length > 1 ? 's' : ''}, du plus récent au plus ancien. Les journaux sont en lecture seule et les secrets connus y sont masqués.`}
          actions={
            canManage && deployments.length > 0 ? (
              <RedeployButton
                projectId={project.id}
                variant={multiApp ? 'primary' : 'outline'}
                label={multiApp ? 'Redéployer toutes les applications' : 'Nouveau déploiement'}
              />
            ) : undefined
          }
        >
          {deployments.length === 0 ? (
            <EmptyState
              title="Aucun déploiement pour ce projet"
              description="Lancez un premier déploiement : son statut et ses journaux s’afficheront ici."
              action={canManage ? <RedeployButton projectId={project.id} variant="primary" label={multiApp ? 'Déployer toutes les applications' : 'Lancer le déploiement'} /> : undefined}
              className="py-10"
            />
          ) : (
            <>
              {multiApp && (
                <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
                  Un déploiement par application : le nom de l’application est indiqué à côté du commit.
                </p>
              )}
              {canManage && (
                <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
                  « Redéployer cette version » reconstruit un déploiement réussi avec les variables
                  d’environnement actuelles. Les migrations de base de données ne sont pas annulées.
                </p>
              )}
              <ul className="divide-y divide-border">
                {deployments.map((deployment, index) => (
                  <li key={deployment.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <StatusPill status={deployment.status} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                          <span className="font-mono">
                            {deployment.commitSha === 'pending' ? 'commit en attente' : deployment.commitSha.slice(0, 7)}
                          </span>
                          {deployment.app && (
                            <span className="rounded-full border border-border px-1.5 text-[11px] font-normal text-muted-foreground">
                              {deployment.app.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                            {project.branch}
                          </span>
                          {index === 0 && <span className="rounded-full border border-border px-1.5 text-[11px] font-medium text-muted-foreground">Dernier</span>}
                          {production?.id === deployment.id && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">Production</span>}
                        </p>
                        {deployment.status === 'failed' && (() => {
                          const diagnosis = diagnoseFailure({ status: deployment.status, logs: deployment.logsSummary, projectId: project.id })
                          return diagnosis ? (
                            <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs">
                              <p className="font-medium text-foreground">{diagnosis.cause}</p>
                              <Link href={diagnosis.action.href} className="mt-1 inline-flex font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                                {diagnosis.action.label}
                              </Link>
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-destructive">
                              Le déploiement a échoué. Ouvrez le journal pour identifier la cause ; les
                              valeurs connues des variables y sont masquées.
                            </p>
                          )
                        })()}
                      </div>
                      <time dateTime={deployment.createdAt.toISOString()} className="text-xs text-muted-foreground">
                        {dateFormat.format(deployment.createdAt)}
                      </time>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <DeploymentLogs
                        projectId={project.id}
                        deploymentId={deployment.id}
                        status={deployment.status}
                        defaultOpen={deployment.id === last?.id && inProgress}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {canManage && !inProgress && deployment.status === 'live' && isCommitSha(deployment.commitSha) && (
                          <RollbackDeploymentButton
                            projectId={project.id}
                            deploymentId={deployment.id}
                            commitSha={deployment.commitSha}
                            createdAtLabel={dateFormat.format(deployment.createdAt)}
                          />
                        )}
                        {canManage && statusInfo(deployment.status).inProgress && (
                          <CancelDeploymentButton projectId={project.id} deploymentId={deployment.id} />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      )}

      {tab === 'variables' && (
        <SectionCard
          id="variables"
          title="Variables d’environnement"
          icon={KeyRound}
          description="Les valeurs sont chiffrées au repos et ne sont jamais renvoyées par le serveur. Une modification s’applique au prochain déploiement."
          actions={
            canManage ? (
              <Link href={`/dashboard/projects/${project.id}/settings#variables`} className={smallLinkClass}>
                Modifier
              </Link>
            ) : undefined
          }
        >
          {project.envVars.length === 0 ? (
            <EmptyState
              title="Aucune variable définie"
              description={
                canManage
                  ? 'Ajoutez une variable (par exemple une clé d’API) : sa valeur restera masquée et chiffrée.'
                  : 'Un propriétaire ou un administrateur peut ajouter des variables au projet.'
              }
              action={
                canManage ? (
                  <Link href={`/dashboard/projects/${project.id}/settings#variables`} className={smallLinkClass}>
                    Ajouter une variable
                  </Link>
                ) : undefined
              }
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-border">
              {project.envVars.map((envVar) => (
                <li key={envVar.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <code className="break-all font-mono text-sm">{envVar.key}</code>
                    <p className="text-xs text-muted-foreground">
                      {envVar.appId
                        ? `Application : ${appNameById.get(envVar.appId) ?? 'inconnue'}`
                        : 'Toutes les applications'}{' '}
                      · Mise à jour le {dateFormat.format(envVar.updatedAt)}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm tracking-widest text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span aria-hidden="true">••••••••</span>
                    <span className="sr-only">Valeur masquée</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
            Une valeur ne peut pas être relue depuis l’interface : pour la remplacer, saisissez-la à
            nouveau dans les paramètres. Les journaux masquent les valeurs connues.
          </p>
        </SectionCard>
      )}

      {tab === 'logs' &&
        (deployed ? (
          <div className="space-y-3">
            <RuntimeLogs
              projectId={project.id}
              services={composeServices}
              apps={multiApp ? runtimeLogApps : []}
            />
          </div>
        ) : (
          <SectionCard
            id="logs"
            title="Journaux d’exécution"
            icon={TerminalSquare}
            description="Les journaux seront disponibles après le premier déploiement du projet."
          >
            <EmptyState
              title="Rien à afficher pour l’instant"
              description="Après le premier déploiement, les dernières lignes du conteneur apparaîtront ici, avec les secrets connus masqués."
              className="py-8"
            />
          </SectionCard>
        ))}
    </div>
  )
}
