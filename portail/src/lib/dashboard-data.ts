import { prisma } from '@/lib/prisma'
import { attentionItems, dailySeries, successRate, summarize, type ProjectLite } from '@/lib/dashboard-metrics'

const DAYS = 14

export type DashboardProject = {
  id: string
  name: string
  framework: string | null
  runtime: string | null
  repoUrl: string
  branch: string
  domain: string | null
  tlsValid: boolean | null
  tlsExpiresAt: string | null
  updatedAt: string
  lastStatus: string | null
  lastCommit: string | null
  lastAt: string | null
  /** Statuts des derniers déploiements, du plus ancien au plus récent (pour la frise). */
  history: string[]
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
export async function loadDashboard(organizationId: string, now = new Date()) {
  const since = new Date(now.getTime() - DAYS * 86_400_000)
  const [projects, recent, activity] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, framework: true, runtime: true, repoUrl: true, branch: true, domain: true, updatedAt: true,
        tlsValid: true, tlsExpiresAt: true,
        deployments: { orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, status: true, commitSha: true, createdAt: true } },
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
      select: { id: true, status: true, commitSha: true, createdAt: true, project: { select: { id: true, name: true, framework: true } } },
    }),
  ])

  const lite: ProjectLite[] = projects.map((p) => ({ id: p.id, name: p.name, framework: p.framework, domain: p.domain, deployments: p.deployments }))
  const cards: DashboardProject[] = projects.map((p) => {
    const last = p.deployments[0]
    return {
      id: p.id, name: p.name, framework: p.framework, runtime: p.runtime, repoUrl: p.repoUrl, branch: p.branch, domain: p.domain,
      tlsValid: p.tlsValid, tlsExpiresAt: p.tlsExpiresAt?.toISOString() ?? null,
      updatedAt: p.updatedAt.toISOString(),
      lastStatus: last?.status ?? null,
      lastCommit: last && last.commitSha !== 'pending' ? last.commitSha.slice(0, 7) : null,
      lastAt: last?.createdAt.toISOString() ?? null,
      history: [...p.deployments].reverse().map((d) => d.status),
    }
  })

  return {
    projects: cards,
    summary: summarize(lite),
    attention: attentionItems(lite).map((a) => ({ ...a, at: a.at.toISOString() })),
    series: dailySeries(recent, DAYS, now),
    deploymentsInWindow: recent.length,
    successRate: successRate(recent),
    activity: activity.map<DashboardActivity>((d) => ({
      id: d.id, status: d.status, commitSha: d.commitSha === 'pending' ? '' : d.commitSha.slice(0, 7), createdAt: d.createdAt.toISOString(),
      projectId: d.project.id, projectName: d.project.name, framework: d.project.framework,
    })),
    windowDays: DAYS,
  }
}
export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>
