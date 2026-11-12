import { prisma } from '@/lib/prisma'
import { attentionItems, dailySeries, successRate, summarize, type ProjectLite } from '@/lib/dashboard-metrics'
import { getPrimaryApp } from '@/lib/project-apps'

const DAYS = 14

export type DashboardProjectApp = {
  framework: string | null
  domain: string | null
  name?: string | null
  position?: number
}

export type DashboardProject = {
  id: string
  name: string
  /** Dérivé de l'app principale (repli miroir projet en compatibilité). */
  framework: string | null
  runtime: string | null
  repoUrl: string
  branch: string
  /** Dérivé de l'app principale (repli miroir projet en compatibilité). */
  domain: string | null
  tlsValid: boolean | null
  tlsExpiresAt: string | null
  updatedAt: string
  lastStatus: string | null
  lastCommit: string | null
  lastAt: string | null
  /** Statuts des derniers déploiements, du plus ancien au plus récent (pour la frise). */
  history: string[]
  /** Nombre d'applications du projet (1 en mono-app). */
  appCount: number
  /** Applications : source de vérité pour la recherche/affichage multi-app. */
  apps: DashboardProjectApp[]
}

export type DashboardActivity =
  | {
      kind: 'deployment'
      id: string
      status: string
      commitSha: string
      createdAt: string
      projectId: string
      projectName: string
      framework: string | null
    }
  | {
      kind: 'domain_verified'
      id: string
      createdAt: string
      projectId: string
      projectName: string
      hostname: string
    }
  | {
      kind: 'member_added'
      id: string
      createdAt: string
      memberName: string
    }

/**
 * Tout ce qu'il faut pour la page d'accueil, calculé côté serveur pour l'organisation donnée
 * (jamais pour un autre locataire) et sérialisé en types simples (dates en ISO).
 */
export async function loadDashboard(organizationId: string, now = new Date(), options?: { quota?: { used: number; limit: number } | null }) {
  const since = new Date(now.getTime() - DAYS * 86_400_000)
  const [projects, recent, deployments, domainVerifications, memberEvents] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        framework: true,
        runtime: true,
        repoUrl: true,
        branch: true,
        domain: true,
        updatedAt: true,
        tlsValid: true,
        tlsExpiresAt: true,
        deployments: { orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, status: true, commitSha: true, createdAt: true, logsSummary: true } },
        apps: {
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, position: true, framework: true, runtime: true, domain: true, tlsValid: true, tlsExpiresAt: true },
        },
        _count: { select: { apps: true } },
      },
    }),
    prisma.deployment.findMany({
      where: { project: { organizationId }, createdAt: { gte: since } },
      select: { status: true, createdAt: true },
      take: 5_000,
    }),
    prisma.deployment.findMany({
      where: { project: { organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        status: true,
        commitSha: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            framework: true,
            apps: {
              orderBy: [{ position: 'asc' }, { name: 'asc' }],
              take: 1,
              select: { framework: true },
            },
          },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { organizationId, action: 'project.domain.verify' },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, createdAt: true, details: true, targetId: true },
    }),
    prisma.member.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, createdAt: true, user: { select: { name: true } } },
    }),
  ])

  const derived = projects.map((p) => {
    const primary = getPrimaryApp(p.apps)
    return {
      ...p,
      _framework: primary?.framework ?? p.framework,
      _runtime: primary?.runtime ?? p.runtime,
      _domain: primary?.domain ?? p.domain,
      _tlsValid: (primary?.tlsValid ?? p.tlsValid) ?? null,
      _tlsExpiresAt: primary?.tlsExpiresAt ?? p.tlsExpiresAt ?? null,
    }
  })

  const lite: ProjectLite[] = derived.map((p) => ({
    id: p.id,
    name: p.name,
    framework: p._framework,
    domain: p._domain,
    tlsExpiresAt: p._tlsExpiresAt,
    deployments: p.deployments.map((d) => ({ id: d.id, status: d.status, createdAt: d.createdAt, commitSha: d.commitSha, logsSummary: d.logsSummary })),
    apps: p.apps.map((app) => ({ framework: app.framework, domain: app.domain, position: app.position, name: app.name })),
  }))
  const cards: DashboardProject[] = derived.map((p) => {
    const last = p.deployments[0]
    return {
      id: p.id,
      name: p.name,
      framework: p._framework,
      runtime: p._runtime,
      repoUrl: p.repoUrl,
      branch: p.branch,
      domain: p._domain,
      tlsValid: p._tlsValid,
      tlsExpiresAt: p._tlsExpiresAt ? p._tlsExpiresAt.toISOString() : null,
      updatedAt: p.updatedAt.toISOString(),
      lastStatus: last?.status ?? null,
      lastCommit: last && last.commitSha !== 'pending' ? last.commitSha.slice(0, 7) : null,
      lastAt: last?.createdAt.toISOString() ?? null,
      history: [...p.deployments].reverse().map((d) => d.status),
      appCount: p._count.apps,
      apps: p.apps.map((app) => ({ framework: app.framework, domain: app.domain, name: app.name, position: app.position })),
    }
  })

  const deploymentActivity: DashboardActivity[] = deployments.map((d) => ({
    kind: 'deployment',
    id: d.id,
    status: d.status,
    commitSha: d.commitSha === 'pending' ? '' : d.commitSha.slice(0, 7),
    createdAt: d.createdAt.toISOString(),
    projectId: d.project.id,
    projectName: d.project.name,
    framework: d.project.apps[0]?.framework ?? d.project.framework,
  }))

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]))
  const domainActivity: DashboardActivity[] = domainVerifications.flatMap((entry) => {
    const details = entry.details as { projectId?: unknown; hostname?: unknown } | null
    const projectId = typeof details?.projectId === 'string' ? details.projectId : null
    const hostname = typeof details?.hostname === 'string' ? details.hostname : null
    const projectName = projectId ? projectNameById.get(projectId) : null
    if (!projectId || !hostname || !projectName) return []
    return [
      {
        kind: 'domain_verified' as const,
        id: `domain-verify:${entry.id}`,
        createdAt: entry.createdAt.toISOString(),
        projectId,
        projectName,
        hostname,
      },
    ]
  })

  const memberActivity: DashboardActivity[] = memberEvents.map((m) => ({
    kind: 'member_added',
    id: `member-added:${m.id}`,
    createdAt: m.createdAt.toISOString(),
    memberName: m.user.name,
  }))

  const activity = [...deploymentActivity, ...domainActivity, ...memberActivity]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)

  return {
    projects: cards,
    summary: summarize(lite, { now, quota: options?.quota }),
    attention: attentionItems(lite, { now, quota: options?.quota }).map((a) => ({
      ...a,
      at: a.at.toISOString(),
      ...(a.kind === 'certificate' ? { expiresAt: a.expiresAt.toISOString() } : {}),
    })),
    series: dailySeries(recent, DAYS, now),
    deploymentsInWindow: recent.length,
    successRate: successRate(recent),
    activity,
    windowDays: DAYS,
  }
}
export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>
