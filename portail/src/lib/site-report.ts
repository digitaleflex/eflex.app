import { prisma } from '@/lib/prisma'

/**
 * Rapport d'exploitation mensuel d'un site (issue #178).
 * Règle du produit : uniquement des données réellement collectées ; le reste est listé dans `notMeasured`.
 */
export interface SiteReportInput {
  month: string // AAAA-MM
  start: Date
  end: Date
  deployments: Array<{ status: string; createdAt: Date }>
  incidents: Array<{ openedAt: Date; resolvedAt: Date | null; cause: string | null }>
  monitored: boolean
  databases: Array<{ kind: string; backupScheduled: boolean; lastRestoreStatus: string | null; lastRestoreFinishedAt: Date | null }>
}

export interface SiteReport {
  month: string
  deployments: { total: number; live: number; failed: number; rollbacked: number; lastAt: string | null }
  availability: {
    measured: boolean
    incidents: number
    downtimeMinutes: number
    /** Estimation à partir des incidents détectés (sondes toutes les 5 min), pas une garantie contractuelle. */
    percent: number | null
    byCause: Record<string, number>
  }
  databases: Array<{ kind: string; backupScheduled: boolean; lastRestoreStatus: string | null; lastRestoreFinishedAt: string | null }>
  notMeasured: string[]
}

export function parseMonth(value: string | null | undefined, now = new Date()): { month: string; start: Date; end: Date } | null {
  const raw = value ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < 2020 || year > 2100) return null
  return { month: raw, start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) }
}

export function buildSiteReport(input: SiteReportInput, now = new Date()): SiteReport {
  const { start, end } = input
  const upTo = end < now ? end : now
  const periodMs = Math.max(0, upTo.getTime() - start.getTime())
  const inMonth = input.deployments.filter((d) => d.createdAt >= start && d.createdAt < end)
  const lastDeployment = inMonth.reduce<Date | null>((last, d) => (!last || d.createdAt > last ? d.createdAt : last), null)

  let downtimeMs = 0
  const byCause: Record<string, number> = {}
  let incidents = 0
  for (const incident of input.incidents) {
    const from = incident.openedAt > start ? incident.openedAt : start
    const to = (incident.resolvedAt ?? now) < upTo ? (incident.resolvedAt ?? now) : upTo
    if (to <= from) continue
    incidents += 1
    downtimeMs += to.getTime() - from.getTime()
    const cause = incident.cause ?? 'inconnue'
    byCause[cause] = (byCause[cause] ?? 0) + 1
  }
  const downtimeMinutes = Math.round(downtimeMs / 60_000)
  const percent =
    input.monitored && periodMs > 0 ? Math.round((1 - Math.min(downtimeMs, periodMs) / periodMs) * 10_000) / 100 : null

  return {
    month: input.month,
    deployments: {
      total: inMonth.length,
      live: inMonth.filter((d) => d.status === 'live').length,
      failed: inMonth.filter((d) => d.status === 'failed').length,
      rollbacked: inMonth.filter((d) => d.status === 'rollbacked').length,
      lastAt: lastDeployment ? lastDeployment.toISOString() : null,
    },
    availability: { measured: input.monitored, incidents, downtimeMinutes, percent, byCause },
    databases: input.databases.map((db) => ({
      kind: db.kind,
      backupScheduled: db.backupScheduled,
      lastRestoreStatus: db.lastRestoreStatus,
      lastRestoreFinishedAt: db.lastRestoreFinishedAt ? db.lastRestoreFinishedAt.toISOString() : null,
    })),
    notMeasured: ['Stockage utilisé', 'Bande passante', 'CPU et mémoire (historique)', 'Temps d’intervention'],
  }
}

export async function loadSiteReport(projectId: string, period: { month: string; start: Date; end: Date }): Promise<SiteReport> {
  const [deployments, incidents, monitors, databases] = await Promise.all([
    prisma.deployment.findMany({
      where: { projectId, createdAt: { gte: period.start, lt: period.end } },
      select: { status: true, createdAt: true },
    }),
    prisma.projectSiteIncident.findMany({
      where: { projectId, openedAt: { lt: period.end }, OR: [{ resolvedAt: null }, { resolvedAt: { gte: period.start } }] },
      select: { openedAt: true, resolvedAt: true, cause: true },
    }),
    prisma.projectSiteMonitor.count({ where: { projectId } }),
    prisma.projectDatabase.findMany({
      where: { projectId },
      select: { kind: true, backupId: true, lastRestoreStatus: true, lastRestoreFinishedAt: true },
    }),
  ])
  return buildSiteReport({
    ...period,
    deployments,
    incidents,
    monitored: monitors > 0,
    databases: databases.map((db) => ({
      kind: db.kind,
      backupScheduled: Boolean(db.backupId),
      lastRestoreStatus: db.lastRestoreStatus,
      lastRestoreFinishedAt: db.lastRestoreFinishedAt,
    })),
  })
}
