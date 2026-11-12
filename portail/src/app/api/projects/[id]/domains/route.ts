import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { canManageProjects } from '@/lib/organizations'
import { platformDomain, validateCustomDomain } from '@/lib/custom-domain'
import { effectivePlan } from '@/lib/billing'
import { getPrimaryApp, resolveEffectiveApp } from '@/lib/project-primary'
import { allowOrg } from '@/lib/rate-limit'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  hostname: z.string().trim().min(1).max(300),
  /** Application ciblée (multi-app). Par défaut : domaine de portée projet/principale. */
  appId: z.string().trim().min(1).optional(),
})

function serialize(domain: {
  id: string
  hostname: string
  appId: string | null
  verifiedAt: Date | null
  tlsValid: boolean | null
  tlsExpiresAt: Date | null
  tlsCheckedAt: Date | null
  createdAt: Date
}) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    appId: domain.appId,
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    tlsValid: domain.tlsValid,
    tlsExpiresAt: domain.tlsExpiresAt?.toISOString() ?? null,
    tlsCheckedAt: domain.tlsCheckedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
  }
}

/** Liste le domaine plateforme et les domaines personnalisés du projet. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const { id } = await params
  const requestedAppId = new URL(request.url).searchParams.get('appId')?.trim() || null
  const projectResult = await requireProject(org, id, {
    id: true,
    domain: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, domain: true, coolifyAppId: true },
    },
    domains: { orderBy: { createdAt: 'asc' } },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as unknown as {
    id: string
    domain: string | null
    apps: Array<{ id: string; name: string; position: number; domain: string | null; coolifyAppId: string | null }>
    domains: Array<{
      id: string; hostname: string; appId: string | null; verifiedAt: Date | null;
      tlsValid: boolean | null; tlsExpiresAt: Date | null; tlsCheckedAt: Date | null; createdAt: Date
    }>
  }
  if (requestedAppId && !project.apps.some((app) => app.id === requestedAppId)) {
    return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
  }

  const plan = await effectivePlan(org.organizationId)
  const filteredDomains = requestedAppId
    ? project.domains.filter((domain) => domain.appId === requestedAppId)
    : project.domains
  const targetApp = requestedAppId
    ? resolveEffectiveApp(project, requestedAppId)
    : (getPrimaryApp(project.apps) ?? null)
  const primary = targetApp
    ? (targetApp.domain ?? (targetApp.position === 0 ? project.domain : null))
    : project.domain

  return NextResponse.json(
    {
      primary,
      target: platformDomain(),
      max: plan.customDomainLimit,
      plan: plan.id,
      domains: filteredDomains.map(serialize),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

/** Ajoute un domaine personnalisé (non actif tant que le DNS n'est pas vérifié). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de modifier les domaines.' }, { status: 403 })
  }

  if (!(await allowOrg(org.organizationId, 'domain-mutate', 20, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de modifications de domaines pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, {
    id: true,
    domain: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, domain: true, coolifyAppId: true },
    },
    _count: { select: { domains: true } },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as unknown as {
    id: string
    domain: string | null
    apps: Array<{ id: string; name: string; position: number; domain: string | null; coolifyAppId: string | null }>
    _count: { domains: number }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Domaine invalide.' }, { status: 400 })
  }

  const validation = validateCustomDomain(parsed.data.hostname)
  if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 })
  const hostname = validation.hostname

  const appId = parsed.data.appId ?? null
  const targetApp = appId ? resolveEffectiveApp(project, appId) : (getPrimaryApp(project.apps) ?? null)
  if (appId && !targetApp) {
    return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
  }

  const primaryDomain = targetApp
    ? (targetApp.domain ?? (targetApp.position === 0 ? project.domain : null))
    : project.domain
  if (hostname === primaryDomain) {
    return NextResponse.json({ error: 'Ce domaine est déjà le domaine principal de cette application.' }, { status: 409 })
  }
  const plan = await effectivePlan(org.organizationId)
  if (project._count.domains >= plan.customDomainLimit) {
    return NextResponse.json(
      { error: `Le plan ${plan.label} est limité à ${plan.customDomainLimit} domaines personnalisés par projet.`, code: 'plan_limit' },
      { status: 422 },
    )
  }

  try {
    const domain = await prisma.projectDomain.create({
      data: { projectId: project.id, hostname, appId },
    })
    await audit({
      actor: { id: session.user.id, email: session.user.email },
      action: 'project.domain.create',
      target: { type: 'project_domain', id: domain.id },
      organizationId: org.organizationId,
      details: { projectId: project.id, hostname, appId },
      request,
    })
    return NextResponse.json(
      {
        domain: serialize(domain),
        target: platformDomain(),
        instructions: `Créez un enregistrement CNAME « ${hostname} » vers « ${platformDomain() ?? 'eflex.app'} », puis cliquez sur Vérifier.`,
      },
      { status: 201 },
    )
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Ce domaine est déjà utilisé par un autre projet.' }, { status: 409 })
    }
    console.error('[domains] ajout impossible', error)
    return NextResponse.json({ error: 'Impossible d’ajouter ce domaine.' }, { status: 500 })
  }
}
