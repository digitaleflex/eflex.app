import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowUpRight,
  GitBranch,
  Globe,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization, canManageProjects } from '@/lib/organizations'
import { AutoRefresh } from '@/components/auto-refresh'
import { LiveRefresh } from '@/components/live-refresh'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { GithubMark } from '@/components/icons/github-mark'
import { RedeployButton } from '@/components/redeploy-button'
import { CancelDeploymentButton } from '@/components/cancel-deployment-button'
import { ProjectAppsSection } from '@/components/project-apps'
import { ProjectTabsNav } from '@/components/project/project-tabs-nav'
import { ProjectSituationBanners } from '@/components/project/project-situation-banners'
import { ProjectOverviewTab } from '@/components/project/project-overview-tab'
import { ProjectDeploymentsTab } from '@/components/project/project-deployments-tab'
import { toDeploymentItemData } from '@/lib/deployment-item-data'
import { ProjectVariablesTab } from '@/components/project/project-variables-tab'
import { ProjectRuntimeLogsTab } from '@/components/project/project-runtime-logs-tab'
import { statusInfo } from '@/lib/project-status'
import { runtimeHealth, tlsHealth } from '@/lib/project-health'
import { nextProjectAction, projectSituation, type NextProjectAction } from '@/lib/project-actions'
import { getApplicationRuntime } from '@/lib/coolify'
import { getPrimaryApp } from '@/lib/project-apps'
import { repoLabel } from '@/lib/repo'
import { resolveProjectTab } from '@/lib/project-tabs'

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

const primaryLinkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11'
const secondaryLinkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11'

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
  const tab = resolveProjectTab(tabParam)
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

  return (
    <div className="space-y-6">
      <AutoRefresh active={inProgress} />
      <LiveRefresh types={['deployment.created', 'deployment.status']} projectId={project.id} />

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

      <ProjectTabsNav
        projectId={project.id}
        activeTab={tab}
        deploymentCount={deployments.length}
        variableCount={project.envVars.length}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {last ? `Dernier déploiement : ${statusInfo(last.status).label}.` : 'Aucun déploiement pour ce projet.'}
      </p>

      <ProjectSituationBanners
        projectId={project.id}
        situation={situation}
        lastStatus={last?.status}
        productionCreatedAt={production?.createdAt ?? null}
        canManage={canManage}
        multiApp={multiApp}
      />

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
        <ProjectOverviewTab
          projectId={project.id}
          branch={project.branch}
          canManage={canManage}
          multiApp={multiApp}
          deployed={deployed}
          primaryDomain={primaryDomain}
          primaryFramework={primaryFramework}
          primaryRuntime={primaryRuntime}
          deployments={deployments}
          last={last}
          production={production}
          principalDomains={principalDomains.map((d) => ({ id: d.id, hostname: d.hostname }))}
          pendingDomains={pendingDomains.map((d) => ({ id: d.id, hostname: d.hostname }))}
          analysis={analysis}
          appHealth={appHealth}
          runtimeError={runtimeError}
          certificateHealth={certificateHealth}
          metricsApps={metricsApps}
        />
      )}

      {tab === 'deployments' && (
        <ProjectDeploymentsTab
          projectId={project.id}
          deployments={deployments.map((deployment) => toDeploymentItemData(deployment, project.id))}
          branch={project.branch}
          canManage={canManage}
          inProgress={inProgress}
          multiApp={multiApp}
          productionId={production?.id ?? null}
        />
      )}

      {tab === 'variables' && (
        <ProjectVariablesTab
          projectId={project.id}
          envVars={project.envVars}
          canManage={canManage}
          appNameById={appNameById}
        />
      )}

      {tab === 'logs' && (
        <ProjectRuntimeLogsTab
          projectId={project.id}
          deployed={deployed}
          services={composeServices}
          apps={multiApp ? runtimeLogApps : []}
        />
      )}
    </div>
  )
}
