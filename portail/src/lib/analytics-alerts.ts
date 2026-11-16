import { prisma } from '@/lib/prisma'
import { notify, memberIds } from '@/lib/notifications'

export type AlertType = 'traffic_spike' | 'traffic_drop'

export const ALERT_TYPES: AlertType[] = ['traffic_spike', 'traffic_drop']
export const ANALYTICS_ALERTS_INTERVAL_MS = 60 * 60 * 1000

export interface AlertInput {
  type: AlertType
  enabled: boolean
  thresholdPct: number
  minBaseline: number
  windowDays: number
  cooldownHours: number
}

export function clampAlert(input: Partial<AlertInput> & { type: AlertType }): AlertInput {
  const thresholdPct = Math.min(1000, Math.max(10, Math.trunc(input.thresholdPct ?? (input.type === 'traffic_drop' ? 50 : 100))))
  const minBaseline = Math.min(100000, Math.max(0, Math.trunc(input.minBaseline ?? 20)))
  const windowDays = Math.min(30, Math.max(1, Math.trunc(input.windowDays ?? 1)))
  const cooldownHours = Math.min(168, Math.max(1, Math.trunc(input.cooldownHours ?? 24)))
  return { type: input.type, enabled: input.enabled ?? false, thresholdPct, minBaseline, windowDays, cooldownHours }
}

function utcStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function evaluateAnalyticsAlerts(now = new Date()): Promise<number> {
  const configs = await prisma.projectAnalytics.findMany({
    where: { enabled: true },
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, name: true, organizationId: true } },
      alerts: { where: { enabled: true } },
    },
  })

  let triggered = 0
  for (const config of configs) {
    for (const alert of config.alerts) {
      try {
        if (alert.lastTriggeredAt && now.getTime() - alert.lastTriggeredAt.getTime() < alert.cooldownHours * 3600_000) {
          continue
        }
        const end = utcStart(now)
        const start = new Date(end); start.setUTCDate(start.getUTCDate() - alert.windowDays)
        const prevStart = new Date(start); prevStart.setUTCDate(prevStart.getUTCDate() - alert.windowDays)

        const [current, previous] = await Promise.all([
          prisma.trafficDailyStat.aggregate({ where: { projectId: config.projectId, date: { gte: start, lt: end } }, _sum: { views: true } }),
          prisma.trafficDailyStat.aggregate({ where: { projectId: config.projectId, date: { gte: prevStart, lt: start } }, _sum: { views: true } }),
        ])
        const cur = current._sum.views ?? 0
        const prev = previous._sum.views ?? 0

        await prisma.analyticsAlert.update({ where: { id: alert.id }, data: { lastEvaluatedAt: now } })

        if (prev < alert.minBaseline) continue
        let shouldTrigger = false
        let pct = 0
        if (alert.type === 'traffic_drop') {
          pct = Math.round(((prev - cur) / prev) * 100)
          shouldTrigger = pct >= alert.thresholdPct
        } else if (alert.type === 'traffic_spike') {
          pct = Math.round(((cur - prev) / prev) * 100)
          shouldTrigger = pct >= alert.thresholdPct
        }
        if (!shouldTrigger) continue

        const recipients = await memberIds(config.project.organizationId, ['owner', 'admin'])
        const dayLabel = alert.windowDays === 1 ? '1 jour' : `${alert.windowDays} jours`
        const isDrop = alert.type === 'traffic_drop'
        const title = isDrop ? `Chute de trafic : ${config.project.name}` : `Pic de trafic : ${config.project.name}`
        const body = isDrop
          ? `Baisse d'environ ${pct}% des pages vues sur ${dayLabel} (${cur.toLocaleString('fr-FR')} vs ${prev.toLocaleString('fr-FR')} sur la période précédente), au-dessus du seuil de ${alert.thresholdPct}%.`
          : `Hausse d'environ ${pct}% des pages vues sur ${dayLabel} (${cur.toLocaleString('fr-FR')} vs ${prev.toLocaleString('fr-FR')} sur la période précédente), au-dessus du seuil de ${alert.thresholdPct}%.`

        await notify({
          userIds: recipients,
          type: alert.type === 'traffic_drop' ? 'analytics.traffic_drop' : 'analytics.traffic_spike',
          title,
          body,
          href: `/dashboard/projects/${config.project.id}`,
          organizationId: config.project.organizationId,
          dedupeKey: `analytics:${alert.id}:${end.toISOString().slice(0, 10)}`,
        })
        await prisma.analyticsAlert.update({ where: { id: alert.id }, data: { lastTriggeredAt: now } })
        triggered++
      } catch (error) {
        console.error('[analytics-alerts] évaluation impossible', alert.id, error)
      }
    }
  }
  return triggered
}

let started = false
export function startAnalyticsAlertsMaintenance(): void {
  if (started || process.env.NODE_ENV === 'test') return
  started = true
  const run = () => {
    evaluateAnalyticsAlerts().catch((error) => console.error('[analytics-alerts] exécution impossible', error))
  }
  setTimeout(run, 60_000)
  setInterval(run, ANALYTICS_ALERTS_INTERVAL_MS)
}
