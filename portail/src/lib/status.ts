/**
 * Supervision de la plateforme : sondages des composants, historique et uptime.
 *
 * Ce module est exclusivement serveur : il est utilisé par `/api/status` et par
 * la page `/status`. Aucun secret n'est exposé dans la réponse (seuls des noms
 * de composants, des états et des messages d'erreur tronqués).
 */
import { createConnection } from 'node:net'
import { prisma } from '@/lib/prisma'
import { checkConnection } from '@/lib/coolify'
import {
  computeOverall,
  uptimePercent,
  type ComponentState,
  type OverallState,
} from '@/lib/status-model'

export type ComponentKey = 'portal' | 'database' | 'redis' | 'coolify' | 'engine'

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  portal: 'Portail EFLEX',
  database: 'Base de données',
  redis: 'Cache / files',
  coolify: 'Déploiement',
  engine: 'Moteur Axiom',
}

export interface ComponentResult {
  key: ComponentKey
  label: string
  state: ComponentState
  latencyMs: number | null
  detail: string
}

export interface IncidentView {
  id: string
  title: string
  description: string | null
  severity: string
  status: string
  startedAt: string
  resolvedAt: string | null
}

export interface StatusSnapshot {
  status: OverallState
  checkedAt: string
  components: ComponentResult[]
  uptime: { window: string; percent: number | null; samples: number }[]
  incidents: IncidentView[]
  maintenance: { enabled: boolean; message: string | null }
}

type Probe = Omit<ComponentResult, 'key' | 'label'>

const TIMEOUT_MS = 3000
const SNAPSHOT_INTERVAL_MS = 60_000

/** Les détails techniques restent côté serveur : la réponse publique reste générique. */
function logProbeFailure(component: ComponentKey, error: unknown): void {
  console.error(
    `[eflex/status] ${component}:`,
    (error instanceof Error ? error.message : String(error)).slice(0, 200)
  )
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai dépassé')), TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** Une sonde ne doit jamais faire échouer la page entière : elle retombe en « indisponible ». */
function safeProbe(component: ComponentKey, probe: Promise<Probe>, detail: string): Promise<Probe> {
  return probe.catch((error) => {
    logProbeFailure(component, error)
    return { state: 'down', latencyMs: null, detail }
  })
}

async function probeDatabase(): Promise<Probe> {
  const start = Date.now()
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`)
    return { state: 'ok', latencyMs: Date.now() - start, detail: 'PostgreSQL' }
  } catch (error) {
    logProbeFailure('database', error)
    return { state: 'down', latencyMs: null, detail: 'Base de données injoignable' }
  }
}

/** Ping RESP minimal : pas de dépendance Redis supplémentaire. */
function probeRedis(): Promise<Probe> {
  const raw = process.env.REDIS_URL
  if (!raw) {
    return Promise.resolve({ state: 'unknown', latencyMs: null, detail: 'REDIS_URL non configurée' })
  }

  let host: string
  let port: number
  try {
    const url = new URL(raw)
    host = url.hostname
    port = Number(url.port || 6379)
  } catch {
    return Promise.resolve({ state: 'down', latencyMs: null, detail: 'REDIS_URL invalide' })
  }

  const start = Date.now()
  return new Promise<Probe>((resolve) => {
    const socket = createConnection({ host, port })
    const finish = (state: ComponentState, detail: string) => {
      socket.destroy()
      resolve({ state, latencyMs: Date.now() - start, detail })
    }
    socket.setTimeout(TIMEOUT_MS)
    socket.once('connect', () => socket.write('PING\r\n'))
    socket.once('data', (chunk) => {
      const reply = chunk.toString().trim()
      finish(reply.includes('PONG') ? 'ok' : 'degraded', reply.slice(0, 80))
    })
    socket.once('timeout', () => finish('down', 'Délai dépassé'))
    socket.once('error', (error) => {
      logProbeFailure('redis', error)
      finish('down', 'Cache injoignable')
    })
  })
}

async function probeCoolify(): Promise<Probe> {
  if (!process.env.COOLIFY_API_URL || !process.env.COOLIFY_API_TOKEN) {
    return { state: 'unknown', latencyMs: null, detail: 'Service de déploiement non configuré' }
  }
  const start = Date.now()
  try {
    const ok = await withTimeout(checkConnection())
    return {
      state: ok ? 'ok' : 'down',
      latencyMs: Date.now() - start,
      detail: ok ? 'Service de déploiement' : 'Service de déploiement injoignable',
    }
  } catch (error) {
    logProbeFailure('coolify', error)
    return { state: 'down', latencyMs: null, detail: 'Service de déploiement injoignable' }
  }
}

async function probeEngine(): Promise<Probe> {
  const base = process.env.STATUS_ENGINE_URL
  if (!base) {
    return { state: 'unknown', latencyMs: null, detail: 'Moteur Axiom non déployé' }
  }
  const start = Date.now()
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    return {
      state: res.ok ? 'ok' : 'down',
      latencyMs: Date.now() - start,
      detail: res.ok ? 'GET /health' : 'Moteur Axiom injoignable',
    }
  } catch (error) {
    logProbeFailure('engine', error)
    return { state: 'down', latencyMs: null, detail: 'Moteur Axiom injoignable' }
  }
}

async function probeAll(): Promise<ComponentResult[]> {
  const [database, redis, coolify, engine] = await Promise.all([
    safeProbe('database', probeDatabase(), 'Base de données injoignable'),
    safeProbe('redis', probeRedis(), 'Cache injoignable'),
    safeProbe('coolify', probeCoolify(), 'Service de déploiement injoignable'),
    safeProbe('engine', probeEngine(), 'Moteur Axiom injoignable'),
  ])

  const probes: Record<ComponentKey, Probe> = {
    portal: { state: 'ok', latencyMs: null, detail: 'Application Next.js' },
    database,
    redis,
    coolify,
    engine,
  }

  return (Object.keys(COMPONENT_LABELS) as ComponentKey[]).map((key) => ({
    key,
    label: COMPONENT_LABELS[key],
    ...probes[key],
  }))
}

/** Un relevé par minute maximum, pour alimenter les métriques d'uptime. */
async function recordSnapshot(components: ComponentResult[]): Promise<void> {
  try {
    const last = await prisma.statusCheck.findFirst({
      orderBy: { checkedAt: 'desc' },
      select: { checkedAt: true },
    })
    if (last && Date.now() - last.checkedAt.getTime() < SNAPSHOT_INTERVAL_MS) return

    // Un composant non configuré n'apporte aucune information de disponibilité :
    // l'enregistrer fausserait le pourcentage (il ne peut jamais être « ok »).
    const observed = components.filter((c) => c.state !== 'unknown')
    if (observed.length === 0) return

    await prisma.statusCheck.createMany({
      data: observed.map((c) => ({
        component: c.key,
        status: c.state,
        latencyMs: c.latencyMs,
      })),
    })
  } catch {
    // La page doit rester disponible même si l'historique est indisponible.
  }
}

async function uptimeWindows(): Promise<StatusSnapshot['uptime']> {
  const windows = [
    { window: '24 heures', days: 1 },
    { window: '7 jours', days: 7 },
    { window: '30 jours', days: 30 },
  ]
  return Promise.all(
    windows.map(async ({ window, days }) => {
      try {
        const since = new Date(Date.now() - days * 86_400_000)
        // Les anciens relevés « unknown » restent en base : ils sont exclus du calcul.
        const observed = { checkedAt: { gte: since }, status: { in: ['ok', 'degraded', 'down'] } }
        const [total, ok] = await Promise.all([
          prisma.statusCheck.count({ where: observed }),
          prisma.statusCheck.count({
            where: { ...observed, status: 'ok' },
          }),
        ])
        return { window, percent: uptimePercent(ok, total), samples: total }
      } catch {
        return { window, percent: null, samples: 0 }
      }
    })
  )
}

async function recentIncidents(): Promise<IncidentView[]> {
  try {
    const rows = await prisma.statusIncident.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    }))
  } catch {
    return []
  }
}

export async function collectStatus(): Promise<StatusSnapshot> {
  const components = await probeAll()
  const [, uptime, incidents] = await Promise.all([
    recordSnapshot(components),
    uptimeWindows(),
    recentIncidents(),
  ])

  return {
    status: computeOverall(components),
    checkedAt: new Date().toISOString(),
    components,
    uptime,
    incidents,
    maintenance: {
      enabled: process.env.MAINTENANCE_MODE === 'true',
      message: process.env.MAINTENANCE_MESSAGE || null,
    },
  }
}
