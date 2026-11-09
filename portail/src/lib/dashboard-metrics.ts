import { attentionRank, statusInfo } from '@/lib/project-status'

export type DeploymentLite = { id: string; status: string; createdAt: Date; commitSha?: string }
export type ProjectLite = {
  id: string
  name: string
  framework: string | null
  domain: string | null
  deployments: DeploymentLite[] // du plus récent au plus ancien
}

export type DayBucket = { day: string; live: number; failed: number; other: number }

/** Nombre de déploiements d'un statut pour un jour UTC (« AAAA-MM-JJ »), tel que renvoyé par l'agrégation SQL. */
export type StatusCount = { day: string; status: string; count: number }

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Premier jour (UTC, à minuit) de la fenêtre de `days` jours qui se termine aujourd'hui. */
export function windowStart(days: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)))
}

/** Déploiements par jour sur `days` jours (jour courant inclus), du plus ancien au plus récent. */
export function dailySeries(counts: readonly StatusCount[], days: number, now = new Date()): DayBucket[] {
  const buckets = new Map<string, DayBucket>()
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(new Date(now.getTime() - i * 86_400_000))
    buckets.set(day, { day, live: 0, failed: 0, other: 0 })
  }
  for (const c of counts) {
    const bucket = buckets.get(c.day)
    if (!bucket) continue
    if (c.status === 'live') bucket.live += c.count
    else if (c.status === 'failed') bucket.failed += c.count
    else bucket.other += c.count
  }
  return [...buckets.values()]
}

/** Part de déploiements réussis parmi ceux qui ont une issue (réussi ou échec) ; null s'il n'y en a aucun. */
export function successRate(counts: readonly { status: string; count: number }[]): number | null {
  const sum = (status: string) => counts.filter((c) => c.status === status).reduce((n, c) => n + c.count, 0)
  const live = sum('live')
  const finished = live + sum('failed')
  return finished === 0 ? null : Math.round((live / finished) * 100)
}

export type Attention = { projectId: string; name: string; kind: 'failed' | 'in-progress'; status: string; deploymentId: string; at: Date }

/**
 * Ce qui demande un regard : le dernier déploiement d'un projet a échoué, ou est en cours.
 * Un échec ancien suivi d'un succès n'apparaît pas.
 */
export function attentionItems(projects: readonly ProjectLite[]): Attention[] {
  const items: Attention[] = []
  for (const p of projects) {
    const last = p.deployments[0]
    if (!last) continue
    const info = statusInfo(last.status)
    if (info.tone === 'danger') items.push({ projectId: p.id, name: p.name, kind: 'failed', status: last.status, deploymentId: last.id, at: last.createdAt })
    else if (info.inProgress) items.push({ projectId: p.id, name: p.name, kind: 'in-progress', status: last.status, deploymentId: last.id, at: last.createdAt })
  }
  return items.sort((a, b) => attentionRank(a.status) - attentionRank(b.status) || b.at.getTime() - a.at.getTime())
}

export function summarize(projects: readonly ProjectLite[]) {
  const live = projects.filter((p) => p.deployments.length > 0 && p.deployments[0]!.status === 'live').length
  return { total: projects.length, live, needsAttention: attentionItems(projects).length }
}
