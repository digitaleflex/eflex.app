import { lookup } from 'node:dns/promises'
import { prisma } from '@/lib/prisma'
import { checkTls } from '@/lib/tls'
import { memberIds, notify } from '@/lib/notifications'
import { publish } from '@/lib/event-bus'

/**
 * Surveillance continue des sites clients (#177).
 * - Cibles : domaines publics connus du projet (apps + domaines personnalisés vérifiés).
 * - Sondes : DNS, HTTP/HTTPS (statut/latence), TLS (validité/expiration).
 * - Incidents : confirmation par échecs consécutifs, déduplication (un incident ouvert), cooldown
 *   (pas de tempête), notification à l'ouverture persistante et au rétablissement.
 * - Isolation : cibles dérivées des enregistrements du projet ; données lues/écrites par projet.
 *
 * Ne couvre pas les métriques ressources/APM (#122).
 */

export const SITE_MONITOR_INTERVAL_MS = 5 * 60 * 1000
export const FAILURE_THRESHOLD = 2
export const RECOVERY_THRESHOLD = 2
export const PROBE_TIMEOUT_MS = 10_000
export const HTTP_UP_MAX_STATUS = 499
export const MAX_MONITORS_PER_RUN = 200
export const INCIDENT_HISTORY_LIMIT = 50

type MonitorStatus = 'unknown' | 'up' | 'down'
type IncidentCause = 'http' | 'dns' | 'tls' | 'timeout' | 'network'

export interface ProbeResult {
  status: MonitorStatus
  httpStatus: number | null
  latencyMs: number | null
  dnsOk: boolean
  tlsOk: boolean | null
  tlsExpiresAt: Date | null
  error: string | null
  cause: IncidentCause | null
}

interface DesiredTarget {
  host: string
  label: string
}

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

function normalizeHost(value: string | null | undefined): string | null {
  const host = (value ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!host || host.length > 253 || !HOST_RE.test(host)) return null
  return host
}

function cleanError(value: unknown, fallback: string): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : ''
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > 180 ? `${text.slice(0, 177)}…` : text
}

export function desiredTargets(project: {
  domain: string | null
  apps: Array<{ name: string; domain: string | null; position: number }>
  domains: Array<{ hostname: string; verifiedAt: Date | null; appId: string | null }>
}): DesiredTarget[] {
  const byHost = new Map<string, DesiredTarget>()
  const add = (hostRaw: string | null | undefined, label: string) => {
    const host = normalizeHost(hostRaw)
    if (!host || byHost.has(host)) return
    byHost.set(host, { host, label })
  }

  const primary = [...project.apps].sort((a, b) => a.position - b.position)[0] ?? null
  if (primary?.domain) add(primary.domain, `Application « ${primary.name} »`)
  else add(project.domain, 'Application principale')

  for (const app of project.apps) {
    if (app.domain) add(app.domain, `Application « ${app.name} »`)
  }
  for (const domain of project.domains) {
    if (domain.verifiedAt) add(domain.hostname, 'Domaine personnalisé')
  }

  return [...byHost.values()]
}

async function probeHost(host: string): Promise<ProbeResult> {
  const dns = await lookup(host).then(() => ({ ok: true as const })).catch((error) => ({
    ok: false as const,
    error: cleanError(error, 'Résolution DNS impossible'),
  }))
  if (!dns.ok) {
    return {
      status: 'down',
      httpStatus: null,
      latencyMs: null,
      dnsOk: false,
      tlsOk: null,
      tlsExpiresAt: null,
      error: dns.error,
      cause: 'dns',
    }
  }

  const tls = await checkTls(host, PROBE_TIMEOUT_MS).catch((error) => ({
    ok: false,
    expiresAt: null as string | null,
    reason: cleanError(error, 'Contrôle TLS impossible'),
  }))

  const started = Date.now()
  try {
    const response = await fetch(`https://${host}/`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { 'user-agent': 'EFLEX-Monitor/1.0 (+https://eflex.app)', accept: '*/*' },
    })
    // Consommer un peu du corps pour ne pas laisser la connexion ouverte ; on n'en stocke rien.
    await response.arrayBuffer().catch(() => undefined)
    const latencyMs = Math.max(0, Date.now() - started)
    const httpStatus = response.status
    const httpOk = httpStatus > 0 && httpStatus <= HTTP_UP_MAX_STATUS
    const tlsOk = tls.ok
    if (httpOk && tlsOk) {
      return {
        status: 'up',
        httpStatus,
        latencyMs,
        dnsOk: true,
        tlsOk: true,
        tlsExpiresAt: tls.expiresAt ? new Date(tls.expiresAt) : null,
        error: null,
        cause: null,
      }
    }
    if (!tlsOk) {
      return {
        status: 'down',
        httpStatus,
        latencyMs,
        dnsOk: true,
        tlsOk: false,
        tlsExpiresAt: tls.expiresAt ? new Date(tls.expiresAt) : null,
        error: tls.reason ?? 'Certificat TLS invalide',
        cause: 'tls',
      }
    }
    return {
      status: 'down',
      httpStatus,
      latencyMs,
      dnsOk: true,
      tlsOk: true,
      tlsExpiresAt: tls.expiresAt ? new Date(tls.expiresAt) : null,
      error: `Réponse HTTP ${httpStatus}`,
      cause: 'http',
    }
  } catch (error) {
    const latencyMs = Math.max(0, Date.now() - started)
    const message = cleanError(error, 'Connexion impossible')
    const timeout = /timeout|aborted|timed out/i.test(message)
    const tlsReason = !tls.ok && tls.reason ? cleanError(tls.reason, 'Certificat TLS invalide') : null
    return {
      status: 'down',
      httpStatus: null,
      latencyMs,
      dnsOk: true,
      tlsOk: tls.ok ? true : tls.reason ? false : null,
      tlsExpiresAt: tls.expiresAt ? new Date(tls.expiresAt) : null,
      error: tlsReason ?? message,
      cause: tlsReason ? 'tls' : timeout ? 'timeout' : 'network',
    }
  }
}

function causeLabel(cause: string | null | undefined): string {
  switch (cause) {
    case 'dns': return 'résolution DNS'
    case 'tls': return 'certificat TLS'
    case 'http': return 'réponse HTTP'
    case 'timeout': return 'délai dépassé'
    case 'network': return 'connexion réseau'
    default: return 'indisponibilité'
  }
}

async function notifyIncident(
  project: { id: string; name: string; organizationId: string },
  monitor: { id: string; host: string },
  incident: { id: string; openedAt: Date; cause: string | null },
  error: string | null,
): Promise<void> {
  const recipients = await memberIds(project.organizationId, ['owner', 'admin'])
  await notify({
    userIds: recipients,
    organizationId: project.organizationId,
    type: 'site_monitor.down',
    title: `Site indisponible : ${project.name}`,
    body: `${monitor.host} ne répond pas correctement (${causeLabel(incident.cause)}). ${error ?? 'Vérifiez la disponibilité du site.'}`.slice(0, 500),
    href: `/dashboard/projects/${project.id}`,
    dedupeKey: `site-incident:open:${incident.id}`,
  })
  await prisma.projectSiteIncident.update({ where: { id: incident.id }, data: { openedNotifiedAt: new Date() } }).catch(() => undefined)
}

async function notifyRecovery(
  project: { id: string; name: string; organizationId: string },
  monitor: { id: string; host: string },
  incident: { id: string },
): Promise<void> {
  const recipients = await memberIds(project.organizationId, ['owner', 'admin'])
  await notify({
    userIds: recipients,
    organizationId: project.organizationId,
    type: 'site_monitor.recovered',
    title: `Site rétabli : ${project.name}`,
    body: `${monitor.host} répond à nouveau normalement.`,
    href: `/dashboard/projects/${project.id}`,
    dedupeKey: `site-incident:resolved:${incident.id}`,
  })
  await prisma.projectSiteIncident.update({ where: { id: incident.id }, data: { resolvedNotifiedAt: new Date() } }).catch(() => undefined)
}

/** Seuils d'alerte d'expiration du certificat TLS, en jours restants (#177). */
export const TLS_EXPIRY_THRESHOLDS_DAYS = [14, 7, 3, 1] as const

/** Plus petit seuil franchi (14, 7, 3 ou 1 jour), ou null si le certificat est loin d'expirer ou déjà expiré. */
export function tlsExpiryThreshold(expiresAt: Date | null | undefined, now: Date): number | null {
  if (!expiresAt) return null
  const days = (expiresAt.getTime() - now.getTime()) / 86_400_000
  if (days <= 0) return null // déjà expiré : la sonde TLS ouvre un incident, pas une alerte d'anticipation
  for (const threshold of [...TLS_EXPIRY_THRESHOLDS_DAYS].reverse()) {
    if (days <= threshold) return threshold
  }
  return null
}

async function notifyTlsExpiry(
  project: { id: string; name: string; organizationId: string },
  monitor: { id: string; host: string },
  expiresAt: Date,
  threshold: number,
): Promise<void> {
  const recipients = await memberIds(project.organizationId, ['owner', 'admin'])
  await notify({
    userIds: recipients,
    organizationId: project.organizationId,
    type: 'site_monitor.tls_expiring',
    title: `Certificat bientôt expiré : ${project.name}`,
    body: `Le certificat de ${monitor.host} expire le ${expiresAt.toISOString().slice(0, 10)} (moins de ${threshold} jour${threshold > 1 ? 's' : ''}). Vérifiez le renouvellement automatique et le DNS du domaine.`,
    href: `/dashboard/projects/${project.id}`,
    // Une alerte par certificat et par seuil : un renouvellement change la date, donc la clé.
    dedupeKey: `site-tls-expiry:${monitor.id}:${expiresAt.toISOString().slice(0, 10)}:${threshold}`,
  })
}

async function publishMonitorEvent(projectId: string, organizationId: string, host: string, status: MonitorStatus): Promise<void> {
  await publish({
    type: 'site_monitor.status',
    audience: 'org',
    organizationId,
    payload: { projectId, host, status },
  }).catch(() => undefined)
}

export async function syncProjectMonitors(projectId: string): Promise<number> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      domain: true,
      organizationId: true,
      apps: { select: { name: true, domain: true, position: true } },
      domains: { select: { hostname: true, verifiedAt: true, appId: true } },
    },
  })
  if (!project) return 0

  const targets = desiredTargets(project)
  const desiredHosts = new Set(targets.map((t) => t.host))

  for (const target of targets) {
    await prisma.projectSiteMonitor.upsert({
      where: { projectId_host: { projectId: project.id, host: target.host } },
      update: { label: target.label, enabled: true, organizationId: project.organizationId },
      create: {
        projectId: project.id,
        organizationId: project.organizationId,
        host: target.host,
        label: target.label,
        enabled: true,
      },
    })
  }

  // Cibles qui ne font plus partie du projet : désactiver (conserve l'historique) sans sonder.
  await prisma.projectSiteMonitor.updateMany({
    where: { projectId: project.id, host: { notIn: [...desiredHosts] } },
    data: { enabled: false },
  })

  return targets.length
}

export async function evaluateMonitor(monitor: {
  id: string
  projectId: string
  organizationId: string
  host: string
  consecutiveFailures: number
  consecutiveSuccesses: number
  project: { id: string; name: string; organizationId: string }
}, probe: ProbeResult, now: Date): Promise<void> {
  const baseData = {
    lastCheckedAt: now,
    lastStatus: probe.status as string,
    lastHttpStatus: probe.httpStatus,
    lastLatencyMs: probe.latencyMs,
    lastDnsOk: probe.dnsOk,
    lastTlsOk: probe.tlsOk,
    lastTlsExpiresAt: probe.tlsExpiresAt,
    lastError: probe.error,
  }

  const tlsThreshold = tlsExpiryThreshold(probe.tlsExpiresAt, now)
  if (tlsThreshold !== null && probe.tlsExpiresAt) {
    await notifyTlsExpiry(monitor.project, { id: monitor.id, host: monitor.host }, probe.tlsExpiresAt, tlsThreshold).catch(
      () => undefined,
    )
  }

  const openIncident = await prisma.projectSiteIncident.findFirst({
    where: { monitorId: monitor.id, status: 'open' },
    orderBy: { openedAt: 'desc' },
  })

  if (probe.status === 'down') {
    const failures = monitor.consecutiveFailures + 1
    const successes = 0
    await prisma.projectSiteMonitor.update({
      where: { id: monitor.id },
      data: { ...baseData, consecutiveFailures: failures, consecutiveSuccesses: successes },
    })

    if (!openIncident && failures >= FAILURE_THRESHOLD) {
      const incident = await prisma.projectSiteIncident.create({
        data: {
          monitorId: monitor.id,
          projectId: monitor.projectId,
          organizationId: monitor.organizationId,
          host: monitor.host,
          status: 'open',
          cause: probe.cause,
          summary: `Indisponibilité détectée (${causeLabel(probe.cause)})`,
          details: probe.error,
          openedAt: now,
        },
      })
      await notifyIncident(monitor.project, { id: monitor.id, host: monitor.host }, incident, probe.error)
      await publishMonitorEvent(monitor.projectId, monitor.organizationId, monitor.host, 'down')
    } else if (openIncident) {
      await prisma.projectSiteIncident.update({
        where: { id: openIncident.id },
        data: {
          cause: probe.cause ?? openIncident.cause,
          details: probe.error ?? openIncident.details,
          summary: `Indisponibilité persistante (${causeLabel(probe.cause ?? openIncident.cause)})`,
        },
      })
    }
    return
  }

  // up
  const successes = monitor.consecutiveSuccesses + 1
  const failures = 0
  await prisma.projectSiteMonitor.update({
    where: { id: monitor.id },
    data: { ...baseData, consecutiveFailures: failures, consecutiveSuccesses: successes },
  })

  if (openIncident && successes >= RECOVERY_THRESHOLD) {
    const resolved = await prisma.projectSiteIncident.update({
      where: { id: openIncident.id },
      data: { status: 'resolved', resolvedAt: now, details: openIncident.details },
    })
    await notifyRecovery(monitor.project, { id: monitor.id, host: monitor.host }, resolved)
    await publishMonitorEvent(monitor.projectId, monitor.organizationId, monitor.host, 'up')
  } else if (!openIncident) {
    // Première mesure saine ou état stable : signaler un état "up" une fois connu (pas de notification).
    await publishMonitorEvent(monitor.projectId, monitor.organizationId, monitor.host, 'up').catch(() => undefined)
  }
}

export async function runSiteMonitoringCycle(now = new Date()): Promise<{ checked: number; targets: number }> {
  // Synchroniser les cibles de tous les projets ayant au moins un domaine connu.
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      domain: true,
      organizationId: true,
      apps: { select: { name: true, domain: true, position: true } },
      domains: { select: { hostname: true, verifiedAt: true, appId: true } },
    },
  })

  let targets = 0
  for (const project of projects) {
    try {
      targets += await syncProjectMonitors(project.id)
    } catch (error) {
      console.error('[site-monitor] sync impossible', project.id, error instanceof Error ? error.message : error)
    }
  }

  const monitors = await prisma.projectSiteMonitor.findMany({
    where: { enabled: true },
    include: { project: { select: { id: true, name: true, organizationId: true } } },
    orderBy: [{ lastCheckedAt: 'asc' }],
    take: MAX_MONITORS_PER_RUN,
  })

  let checked = 0
  for (const monitor of monitors) {
    try {
      const probe = await probeHost(monitor.host)
      await evaluateMonitor(monitor, probe, now)
      checked += 1
    } catch (error) {
      console.error('[site-monitor] contrôle impossible', monitor.host, error instanceof Error ? error.message : error)
    }
  }

  return { checked, targets }
}

export interface SiteMonitorView {
  id: string
  host: string
  label: string | null
  enabled: boolean
  lastCheckedAt: string | null
  lastStatus: string
  lastHttpStatus: number | null
  lastLatencyMs: number | null
  lastDnsOk: boolean | null
  lastTlsOk: boolean | null
  lastTlsExpiresAt: string | null
  lastError: string | null
  hasOpenIncident: boolean
}

export interface SiteIncidentView {
  id: string
  host: string
  status: string
  cause: string | null
  summary: string
  details: string | null
  openedAt: string
  resolvedAt: string | null
}

export async function getProjectSiteMonitoring(projectId: string): Promise<{
  monitors: SiteMonitorView[]
  incidents: SiteIncidentView[]
}> {
  const [monitors, incidents, openIncidents] = await Promise.all([
    prisma.projectSiteMonitor.findMany({
      where: { projectId, enabled: true },
      orderBy: [{ host: 'asc' }],
      select: {
        id: true,
        host: true,
        label: true,
        enabled: true,
        lastCheckedAt: true,
        lastStatus: true,
        lastHttpStatus: true,
        lastLatencyMs: true,
        lastDnsOk: true,
        lastTlsOk: true,
        lastTlsExpiresAt: true,
        lastError: true,
      },
    }),
    prisma.projectSiteIncident.findMany({
      where: { projectId },
      orderBy: { openedAt: 'desc' },
      take: INCIDENT_HISTORY_LIMIT,
      select: {
        id: true,
        host: true,
        status: true,
        cause: true,
        summary: true,
        details: true,
        openedAt: true,
        resolvedAt: true,
      },
    }),
    prisma.projectSiteIncident.findMany({
      where: { projectId, status: 'open' },
      select: { monitorId: true },
    }),
  ])

  const openSet = new Set(openIncidents.map((i) => i.monitorId))
  return {
    monitors: monitors.map((m) => ({
      id: m.id,
      host: m.host,
      label: m.label,
      enabled: m.enabled,
      lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
      lastStatus: m.lastStatus,
      lastHttpStatus: m.lastHttpStatus,
      lastLatencyMs: m.lastLatencyMs,
      lastDnsOk: m.lastDnsOk,
      lastTlsOk: m.lastTlsOk,
      lastTlsExpiresAt: m.lastTlsExpiresAt?.toISOString() ?? null,
      lastError: m.lastError,
      hasOpenIncident: openSet.has(m.id),
    })),
    incidents: incidents.map((i) => ({
      id: i.id,
      host: i.host,
      status: i.status,
      cause: i.cause,
      summary: i.summary,
      details: i.details,
      openedAt: i.openedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
    })),
  }
}

let started = false
export function startSiteMonitoringMaintenance(): void {
  if (started || process.env.NODE_ENV === 'test') return
  started = true
  const run = () => {
    runSiteMonitoringCycle().catch((error) => console.error('[site-monitor] exécution impossible', error))
  }
  setTimeout(run, 45_000)
  setInterval(run, SITE_MONITOR_INTERVAL_MS)
}
