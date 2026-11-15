import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { check, checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { assertProjectManager, requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'
import { appUrl } from '@/lib/email'
import {
  ANALYTICS_RETENTION_DEFAULT_DAYS,
  analyticsConfigUpdateSchema,
  buildAnalyticsEventSnippet,
  buildAnalyticsSnippet,
  firstAnalyticsIssue,
  generateAnalyticsPublicKey,
  normalizeGoalEvents,
  purgeTrafficStatsForProject,
} from '@/lib/analytics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function collectUrl() {
  return appUrl('/api/collect')
}

function serializeConfig(config: {
  enabled: boolean
  publicKey: string
  respectDnt: boolean
  collectPath: boolean
  retentionDays: number
  goalEvents: string[]
  createdAt: Date
  updatedAt: Date
}) {
  const url = collectUrl()
  return {
    enabled: config.enabled,
    publicKey: config.publicKey,
    respectDnt: config.respectDnt,
    collectPath: config.collectPath,
    retentionDays: config.retentionDays,
    goalEvents: config.goalEvents ?? [],
    snippet: buildAnalyticsSnippet(config.publicKey, url),
    snippetConsent: buildAnalyticsSnippet(config.publicKey, url, { requireConsent: true }),
    eventSnippet: buildAnalyticsEventSnippet(config.publicKey, url),
    collectUrl: url,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response

  const config = await prisma.projectAnalytics.findUnique({
    where: { projectId: projectResult.project.id },
  })

  if (!config) {
    return NextResponse.json({
      config: {
        enabled: false,
        publicKey: null,
        respectDnt: true,
        collectPath: true,
        retentionDays: ANALYTICS_RETENTION_DEFAULT_DAYS,
        goalEvents: [],
        snippet: null,
        snippetConsent: null,
        eventSnippet: null,
        collectUrl: collectUrl(),
        createdAt: null,
        updatedAt: null,
      },
    })
  }

  // Rétention effectivement appliquée : purge opportuniste des statistiques expirées.
  await purgeTrafficStatsForProject(prisma, projectResult.project.id)

  return NextResponse.json({ config: serializeConfig(config) })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const denied = assertProjectManager(org)
  if (denied) return denied

  const userLimit = await check(`analytics-config:${session.user.id}`, 30, 60_000, { action: 'analytics-config', scope: 'user' })
  if (!userLimit.allowed) {
    return rateLimitedResponse(userLimit, 'Trop de modifications en peu de temps. Patientez une minute.')
  }
  const orgLimit = await checkOrg(org.organizationId, 'analytics-config', 60, 60_000)
  if (!orgLimit.allowed) {
    return rateLimitedResponse(orgLimit, 'Trop de modifications pour cette organisation. Patientez une minute.')
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, { id: true })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  const parsed = analyticsConfigUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstAnalyticsIssue(parsed.error) }, { status: 400 })
  }

  const existing = await prisma.projectAnalytics.findUnique({ where: { projectId: project.id } })

  const data: {
    enabled?: boolean
    respectDnt?: boolean
    collectPath?: boolean
    retentionDays?: number
    publicKey?: string
    goalEvents?: string[]
  } = {}

  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled
  if (parsed.data.respectDnt !== undefined) data.respectDnt = parsed.data.respectDnt
  if (parsed.data.collectPath !== undefined) data.collectPath = parsed.data.collectPath
  if (parsed.data.retentionDays !== undefined) data.retentionDays = parsed.data.retentionDays
  if (parsed.data.goalEvents !== undefined) data.goalEvents = normalizeGoalEvents(parsed.data.goalEvents)
  if (!existing || parsed.data.regenerateKey) data.publicKey = generateAnalyticsPublicKey()

  const config = existing
    ? await prisma.projectAnalytics.update({ where: { projectId: project.id }, data })
    : await prisma.projectAnalytics.create({
        data: {
          projectId: project.id,
          publicKey: data.publicKey ?? generateAnalyticsPublicKey(),
          enabled: data.enabled ?? false,
          respectDnt: data.respectDnt ?? true,
          collectPath: data.collectPath ?? true,
          retentionDays: data.retentionDays ?? ANALYTICS_RETENTION_DEFAULT_DAYS,
          goalEvents: data.goalEvents ?? [],
        },
      })

  // Après modification (activation, rétention, rotation de clé), on applique la rétention en vigueur.
  await purgeTrafficStatsForProject(prisma, project.id)

  const changes: Record<string, unknown> = { created: !existing }
  if (parsed.data.enabled !== undefined) changes.enabled = config.enabled
  if (parsed.data.respectDnt !== undefined) changes.respectDnt = config.respectDnt
  if (parsed.data.collectPath !== undefined) changes.collectPath = config.collectPath
  if (parsed.data.retentionDays !== undefined) changes.retentionDays = config.retentionDays
  if (parsed.data.goalEvents !== undefined) changes.goalEventsCount = config.goalEvents.length
  if (parsed.data.regenerateKey) changes.keyRotated = true

  await audit({
    actor: { id: session.user.id, email: session.user.email ?? '' },
    action: 'project.analytics.config.update',
    target: { type: 'project', id: project.id },
    organizationId: org.organizationId,
    details: changes,
    request,
  })

  return NextResponse.json({ config: serializeConfig(config) })
}
