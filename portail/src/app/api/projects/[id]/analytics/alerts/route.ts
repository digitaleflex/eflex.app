import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { assertProjectManager, requireManagedProject, requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'
import { ALERT_TYPES, clampAlert, type AlertType } from '@/lib/analytics-alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAlertType(v: unknown): v is AlertType {
  return typeof v === 'string' && (ALERT_TYPES as string[]).includes(v)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const scoped = await requireManagedProject(session, id, { id: true })
  if ('response' in scoped) return scoped.response

  const config = await prisma.projectAnalytics.findUnique({
    where: { projectId: scoped.project.id },
    select: { id: true, alerts: true },
  })
  const alerts = (config?.alerts ?? []).map((a) => ({
    type: a.type,
    enabled: a.enabled,
    thresholdPct: a.thresholdPct,
    minBaseline: a.minBaseline,
    windowDays: a.windowDays,
    cooldownHours: a.cooldownHours,
    lastTriggeredAt: a.lastTriggeredAt ? a.lastTriggeredAt.toISOString() : null,
    lastEvaluatedAt: a.lastEvaluatedAt ? a.lastEvaluatedAt.toISOString() : null,
  }))
  return NextResponse.json({ alerts })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  const denied = assertProjectManager(org)
  if (denied) return denied

  const userLimit = await check(`analytics-alerts:${session.user.id}`, 30, 60_000, { action: 'analytics-alerts', scope: 'user' })
  if (!userLimit.allowed) return rateLimitedResponse(userLimit, 'Trop de modifications en peu de temps. Patientez une minute.')
  const orgLimit = await checkOrg(org.organizationId, 'analytics-alerts', 60, 60_000)
  if (!orgLimit.allowed) return rateLimitedResponse(orgLimit, 'Trop de modifications pour cette organisation. Patientez une minute.')

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }) }
  const input = body as { alerts?: unknown }
  if (!Array.isArray(input.alerts)) return NextResponse.json({ error: 'Liste d’alertes invalide.' }, { status: 400 })

  const config = await prisma.projectAnalytics.findUnique({ where: { projectId: projectResult.project.id }, select: { id: true } })
  if (!config) return NextResponse.json({ error: 'Activez d’abord la mesure d’audience pour configurer des alertes.' }, { status: 400 })

  const updates = input.alerts.filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && isAlertType((a as any).type))
  for (const a of updates) {
    const clamped = clampAlert({
      type: a.type as AlertType,
      enabled: typeof a.enabled === 'boolean' ? a.enabled : undefined,
      thresholdPct: typeof a.thresholdPct === 'number' ? a.thresholdPct : undefined,
      minBaseline: typeof a.minBaseline === 'number' ? a.minBaseline : undefined,
      windowDays: typeof a.windowDays === 'number' ? a.windowDays : undefined,
      cooldownHours: typeof a.cooldownHours === 'number' ? a.cooldownHours : undefined,
    })
    await prisma.analyticsAlert.upsert({
      where: { analyticsId_type: { analyticsId: config.id, type: clamped.type } },
      create: { analyticsId: config.id, ...clamped },
      update: { enabled: clamped.enabled, thresholdPct: clamped.thresholdPct, minBaseline: clamped.minBaseline, windowDays: clamped.windowDays, cooldownHours: clamped.cooldownHours },
    })
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email ?? '' },
    action: 'project.analytics.alerts.update',
    target: { type: 'project', id: projectResult.project.id },
    organizationId: org.organizationId,
    details: { count: updates.length, types: updates.map((u) => u.type) },
    request,
  })

  const alerts = await prisma.analyticsAlert.findMany({ where: { analyticsId: config.id } })
  return NextResponse.json({ alerts: alerts.map((a) => ({ type: a.type, enabled: a.enabled, thresholdPct: a.thresholdPct, minBaseline: a.minBaseline, windowDays: a.windowDays, cooldownHours: a.cooldownHours, lastTriggeredAt: a.lastTriggeredAt ? a.lastTriggeredAt.toISOString() : null, lastEvaluatedAt: a.lastEvaluatedAt ? a.lastEvaluatedAt.toISOString() : null })) })
}
