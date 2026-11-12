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

export type DashboardActivity = {
  id: string
  status: string
  commitSha: string
  createdAt: string
  projectId: string
  projectName: string
  framework: string | null
}

/**
 * Tout ce qu'il faut pour la page d'accueil, calculé côté serveur pour l'organisation donnée
 * (jamais pour un autre locataire) et sérialisé en types simples (dates en ISO).
 */
export async function loadDashboard(organizationId: string, now = new Date(), options?: { quota?: { used: number; limit: number } | null }) {
  const since = new Date(now.getTime() - DAYS * 86_400_000)
  const [projects, recent, activity] = await Promise.all([
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
        deployments: { orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, status: true, commitSha: true, createdAt: true } },
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
    deployments: p.deployments,
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
    activity: activity.map<DashboardActivity>((d) => ({
      id: d.id,
      status: d.status,
      commitSha: d.commitSha === 'pending' ? '' : d.commitSha.slice(0, 7),
      createdAt: d.createdAt.toISOString(),
      projectId: d.project.id,
      projectName: d.project.name,
      framework: d.project.apps[0]?.framework ?? d.project.framework,
    })),
    windowDays: DAYS,
  }
}
export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>
