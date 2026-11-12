import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects } from '@/lib/organizations'
import { applicationAction, getApplicationRuntime, type ApplicationAction } from '@/lib/coolify'
import { getPrimaryApp } from '@/lib/project-primary'
import { allowOrg } from '@/lib/rate-limit'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
  /** Application ciblée (multi-app). Par défaut : application principale. */
  appId: z.string().trim().min(1).optional(),
})

const PROJECT_RUNTIME_SELECT = {
  id: true,
  coolifyAppId: true,
  domain: true,
  tlsValid: true,
  tlsExpiresAt: true,
  tlsCheckedAt: true,
  apps: {
    orderBy: [{ position: 'asc' as const }, { name: 'asc' as const }],
    select: {
      id: true,
      name: true,
      position: true,
      coolifyAppId: true,
      domain: true,
      tlsValid: true,
      tlsExpiresAt: true,
      tlsCheckedAt: true,
    },
  },
}

type RuntimeProject = {
  id: string
  coolifyAppId: string | null
  domain: string | null
  tlsValid: boolean | null
  tlsExpiresAt: Date | null
  tlsCheckedAt: Date | null
  apps: Array<{
    id: string
    name: string
    position: number
    coolifyAppId: string | null
    domain: string | null
    tlsValid: boolean | null
    tlsExpiresAt: Date | null
    tlsCheckedAt: Date | null
  }>
}

function resolveTarget(
  project: RuntimeProject,
  requestedAppId: string | null,
): { target: { id: string | null; coolifyAppId: string | null; tlsValid: boolean | null; tlsExpiresAt: Date | null; tlsCheckedAt: Date | null }; notFound: boolean } {
  if (requestedAppId) {
    const app = project.apps.find((item) => item.id === requestedAppId)
    if (!app) {
      return {
        target: { id: null, coolifyAppId: null, tlsValid: null, tlsExpiresAt: null, tlsCheckedAt: null },
        notFound: true,
      }
    }
    return { target: { id: app.id, coolifyAppId: app.coolifyAppId, tlsValid: app.tlsValid, tlsExpiresAt: app.tlsExpiresAt, tlsCheckedAt: app.tlsCheckedAt }, notFound: false }
  }
  if (project.apps.length > 0) {
    const app = project.apps.find((item) => item.coolifyAppId) ?? getPrimaryApp(project.apps) ?? project.apps[0]!
    return { target: { id: app.id, coolifyAppId: app.coolifyAppId, tlsValid: app.tlsValid, tlsExpiresAt: app.tlsExpiresAt, tlsCheckedAt: app.tlsCheckedAt }, notFound: false }
  }
  return {
    target: { id: null, coolifyAppId: project.coolifyAppId, tlsValid: project.tlsValid, tlsExpiresAt: project.tlsExpiresAt, tlsCheckedAt: project.tlsCheckedAt },
    notFound: false,
  }
}

function tlsPayload(target: { tlsValid: boolean | null; tlsExpiresAt: Date | null; tlsCheckedAt: Date | null }) {
  return {
    valid: target.tlsValid,
    expiresAt: target.tlsExpiresAt?.toISOString() ?? null,
    checkedAt: target.tlsCheckedAt?.toISOString() ?? null,
  }
}

/** Statut runtime Coolify + dernier contrôle TLS (lecture seule). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')

  const { id } = await params
  const projectResult = await requireProject(org, id, PROJECT_RUNTIME_SELECT)
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as unknown as RuntimeProject

  const requestedAppId = new URL(request.url).searchParams.get('appId')?.trim() || null
  const { target, notFound } = resolveTarget(project, requestedAppId)
  if (notFound) return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })

  const tls = tlsPayload(target)

  if (!target.coolifyAppId) {
    return NextResponse.json({ deployed: false, app: null, tls, appId: target.id })
  }

  const runtime = await getApplicationRuntime(target.coolifyAppId)
  if ('error' in runtime) {
    return NextResponse.json({ deployed: true, app: null, tls, appId: target.id, error: runtime.error })
  }
  return NextResponse.json({ deployed: true, app: runtime, tls, appId: target.id })
}

/** Démarre, arrête ou redémarre l'application Coolify du projet. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  }

  if (!(await allowOrg(org.organizationId, 'runtime-action', 30, 60_000))) {
    return NextResponse.json(
      { error: 'Trop d’actions d’exécution pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, PROJECT_RUNTIME_SELECT)
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as unknown as RuntimeProject

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Action invalide.' }, { status: 400 })
  }

  const requestedAppId = parsed.data.appId ?? new URL(request.url).searchParams.get('appId')?.trim() ?? null
  const { target, notFound } = resolveTarget(project, requestedAppId)
  if (notFound) return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
  if (!target.coolifyAppId) {
    return NextResponse.json({ error: "Cette application n'a pas encore été déployée." }, { status: 409 })
  }

  const result = await applicationAction(target.coolifyAppId, parsed.data.action as ApplicationAction)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, appId: target.id })
}
