import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { check, checkIp, rateLimitHeaders } from '@/lib/rate-limit'
import {
  collectPayloadSchema,
  hasDoNotTrackSignal,
  isAnalyticsPublicKey,
  normalizeAnalyticsEventName,
  normalizeAnalyticsPath,
  utcDay,
} from '@/lib/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
}

function noContent(status = 204, extraHeaders?: Record<string, string>) {
  return new NextResponse(null, { status, headers: { ...CORS_HEADERS, ...extraHeaders } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  // Limite IP globale pour contenir les abus sur le point d'ingestion public.
  const ipLimit = await checkIp(request, 'analytics-collect', 120, 60_000)
  if (!ipLimit.allowed) {
    // Silencieux sur abus : pas de 429 explicite ni de corps.
    return noContent(204, rateLimitHeaders(ipLimit))
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    // Beacon/fetch peuvent envoyer un corps texte ; on tente une lecture tolérante.
    try {
      const text = await request.clone().text()
      body = text ? JSON.parse(text) : null
    } catch {
      return noContent(204)
    }
  }

  const parsed = collectPayloadSchema.safeParse(body)
  if (!parsed.success) return noContent(204)

  const { k: publicKey, p, t, n } = parsed.data
  if (!isAnalyticsPublicKey(publicKey)) return noContent(204)

  // Limite par clé d'écriture pour éviter qu'un seul projet ne sature l'ingestion.
  const keyLimit = await check(`analytics-key:${publicKey}`, 600, 60_000, { action: 'analytics-collect-key', scope: 'key' })
  if (!keyLimit.allowed) {
    return noContent(204, rateLimitHeaders(keyLimit))
  }

  const config = await prisma.projectAnalytics.findUnique({
    where: { publicKey },
    select: { id: true, projectId: true, enabled: true, respectDnt: true, collectPath: true, lastReceivedAt: true },
  })

  // Réponse muette pour ne pas révéler l'existence ou l'état d'une clé.
  if (!config || !config.enabled) return noContent(204)

  if (config.respectDnt && hasDoNotTrackSignal(request.headers)) {
    return noContent(204)
  }

  // Quota journalier par clé/projet (#111/#113) : évite qu'un seul site ne sature le stockage.
  const dayKey = `analytics-day:${publicKey}:${utcDay().toISOString().slice(0, 10)}`
  const dailyLimit = await check(dayKey, 50_000, 86_400_000, { action: 'analytics-collect-day', scope: 'key' })
  if (!dailyLimit.allowed) {
    return noContent(204)
  }

  const date = utcDay()
  let counted = false

  try {
    if (t === 'event') {
      // Événement nommé (#111) : agrégation quotidienne par nom uniquement, sans
      // propriété ni chemin, pour préserver la minimisation.
      const name = normalizeAnalyticsEventName(n)
      if (!name) return noContent(204)
      await prisma.analyticsEventDaily.upsert({
        where: { projectId_date_name: { projectId: config.projectId, date, name } },
        create: { projectId: config.projectId, date, name, count: 1 },
        update: { count: { increment: 1 } },
      })
      counted = true
    } else {
      const path = config.collectPath ? normalizeAnalyticsPath(p) : '/'
      await prisma.trafficDailyStat.upsert({
        where: { projectId_date_path: { projectId: config.projectId, date, path } },
        create: { projectId: config.projectId, date, path, views: 1 },
        update: { views: { increment: 1 } },
      })
      counted = true
    }
  } catch {
    // Ne jamais exposer d'erreur interne sur un endpoint public de collecte.
    return noContent(204)
  }

  // Vérification d'installation (#109) : horodatage de la dernière mesure reçue, limité
  // à une écriture toutes les 5 minutes pour ne pas charger le chemin d'ingestion.
  if (counted) {
    const now = Date.now()
    if (!config.lastReceivedAt || now - config.lastReceivedAt.getTime() > 5 * 60_000) {
      prisma.projectAnalytics
        .update({ where: { id: config.id }, data: { lastReceivedAt: new Date(now) } })
        .catch(() => {})
    }
  }

  return noContent(204)
}
