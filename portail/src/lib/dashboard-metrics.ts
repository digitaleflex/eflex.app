import { attentionRank, statusInfo } from '@/lib/project-status'
import { diagnoseFailure, type Diagnosis } from '@/lib/deployment-diagnosis'

export type DeploymentLite = { id: string; status: string; createdAt: Date; commitSha?: string; logsSummary?: string | null }
export type ProjectLiteApp = { framework?: string | null; domain?: string | null; position?: number; name?: string | null }
export type ProjectLite = {
  id: string
  name: string
  /** Miroirs projet (compatibilité) ; l'app principale prévaut quand `apps` est fourni. */
  framework: string | null
  domain: string | null
  tlsExpiresAt?: Date | null
  deployments: DeploymentLite[] // du plus récent au plus ancien
  /** Applications du projet : source de vérité pour domaine/framework. */
  apps?: readonly ProjectLiteApp[]
}

export type DayBucket = { day: string; live: number; failed: number; other: number }

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Déploiements par jour sur `days` jours (jour courant inclus), du plus ancien au plus récent. */
export function dailySeries(deployments: readonly { status: string; createdAt: Date }[], days: number, now = new Date()): DayBucket[] {
  const buckets = new Map<string, DayBucket>()
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(new Date(now.getTime() - i * 86_400_000))
    buckets.set(day, { day, live: 0, failed: 0, other: 0 })
  }
  for (const d of deployments) {
    const bucket = buckets.get(dayKey(d.createdAt))
    if (!bucket) continue
    if (d.status === 'live') bucket.live += 1
    else if (d.status === 'failed') bucket.failed += 1
    else bucket.other += 1
  }
  return [...buckets.values()]
}

/** Part de déploiements réussis parmi ceux qui ont une issue (réussi ou échec) ; null s'il n'y en a aucun. */
export function successRate(deployments: readonly { status: string }[]): number | null {
  const finished = deployments.filter((d) => d.status === 'live' || d.status === 'failed')
  if (finished.length === 0) return null
  return Math.round((finished.filter((d) => d.status === 'live').length / finished.length) * 100)
}

export type Attention =
  | { kind: 'failed' | 'in-progress'; projectId: string; name: string; status: string; deploymentId: string; at: Date; diagnosis?: Diagnosis | null }
  | { kind: 'certificate'; projectId: string; name: string; at: Date; expiresAt: Date }
  | { kind: 'quota'; at: Date; used: number; limit: number }

const FOURTEEN_DAYS = 14 * 86_400_000

/**
 * Ce qui demande un regard : déploiement en échec/en cours (échec corrigé exclu),
 * certificats expirant sous 14 jours, et quota proche/atteint.
 */
export function attentionItems(
  projects: readonly ProjectLite[],
  options?: { now?: Date; quota?: { used: number; limit: number } | null },
): Attention[] {
  const now = options?.now ?? new Date()
  const items: Attention[] = []
  for (const p of projects) {
    const last = p.deployments[0]
    if (last) {
      const info = statusInfo(last.status)
      if (info.tone === 'danger') {
        items.push({
          projectId: p.id, name: p.name, kind: 'failed', status: last.status, deploymentId: last.id, at: last.createdAt,
          diagnosis: diagnoseFailure({ status: last.status, logs: last.logsSummary, projectId: p.id }),
        })
      } else if (info.inProgress) {
        items.push({ projectId: p.id, name: p.name, kind: 'in-progress', status: last.status, deploymentId: last.id, at: last.createdAt })
      }
    }
    const exp = p.tlsExpiresAt ?? null
    if (exp && exp.getTime() - now.getTime() <= FOURTEEN_DAYS) {
      items.push({ kind: 'certificate', projectId: p.id, name: p.name, at: now, expiresAt: exp })
    }
  }
  const quota = options?.quota
  if (quota && quota.limit > 0 && quota.used / quota.limit >= 0.8) {
    items.push({ kind: 'quota', at: now, used: quota.used, limit: quota.limit })
  }
  return items.sort((a, b) => {
    const ar = xKindRank(a)
    const br = xKindRank(b)
    if (ar !== br) return ar - br
    return b.at.getTime() - a.at.getTime()
  })
}

function xKindRank(a: Attention): number {
  if (a.kind === 'failed') return attentionRank(a.status)
  if (a.kind === 'certificate') return 10
  if (a.kind === 'quota') return 11
  return attentionRank(a.status)
}

export function summarize(projects: readonly ProjectLite[], options?: { now?: Date; quota?: { used: number; limit: number } | null }) {
  const live = projects.filter((p) => p.deployments.length > 0 && p.deployments[0]!.status === 'live').length
  return { total: projects.length, live, needsAttention: attentionItems(projects, options).length }
}
