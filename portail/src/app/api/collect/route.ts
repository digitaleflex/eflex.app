import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { allow, allowIp } from '@/lib/rate-limit'
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

function noContent(status = 204) {
  return new NextResponse(null, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  // Limite IP globale pour contenir les abus sur le point d'ingestion public.
  if (!(await allowIp(request, 'analytics-collect', 120, 60_000))) {
    return noContent(429)
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
  if (!(await allow(`analytics-key:${publicKey}`, 600, 60_000))) {
    return noContent(429)
  }

  const config = await prisma.projectAnalytics.findUnique({
    where: { publicKey },
    select: { projectId: true, enabled: true, respectDnt: true, collectPath: true },
  })

  // Réponse muette pour ne pas révéler l'existence ou l'état d'une clé.
  if (!config || !config.enabled) return noContent(204)

  if (config.respectDnt && hasDoNotTrackSignal(request.headers)) {
    return noContent(204)
  }

  const date = utcDay()

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
    } else {
      const path = config.collectPath ? normalizeAnalyticsPath(p) : '/'
      await prisma.trafficDailyStat.upsert({
        where: { projectId_date_path: { projectId: config.projectId, date, path } },
        create: { projectId: config.projectId, date, path, views: 1 },
        update: { views: { increment: 1 } },
      })
    }
  } catch {
    // Ne jamais exposer d'erreur interne sur un endpoint public de collecte.
    return noContent(204)
  }

  return noContent(204)
}
