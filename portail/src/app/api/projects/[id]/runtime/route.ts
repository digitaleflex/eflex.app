import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { canManageProjects } from '@/lib/organizations'
import { applicationAction, getApplicationRuntime, type ApplicationAction } from '@/lib/coolify'
import { getPrimaryApp } from '@/lib/project-primary'
import { checkOrg, rateLimitedResponse } from '@/lib/rate-limit'
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

const APP_ID_REQUIRED = 'Plusieurs applications existent pour ce projet. Précisez le paramètre « appId ».'

function resolveTarget(
  project: RuntimeProject,
  requestedAppId: string | null,
): { target: { id: string | null; coolifyAppId: string | null; tlsValid: boolean | null; tlsExpiresAt: Date | null; tlsCheckedAt: Date | null }; notFound: boolean; ambiguous: boolean } {
  if (project.apps.length > 1 && !requestedAppId) {
    return {
      target: { id: null, coolifyAppId: null, tlsValid: null, tlsExpiresAt: null, tlsCheckedAt: null },
      notFound: false,
      ambiguous: true,
    }
  }
  if (requestedAppId) {
    const app = project.apps.find((item) => item.id === requestedAppId)
    if (!app) {
      return {
        target: { id: null, coolifyAppId: null, tlsValid: null, tlsExpiresAt: null, tlsCheckedAt: null },
        notFound: true,
        ambiguous: false,
      }
    }
    return { target: { id: app.id, coolifyAppId: app.coolifyAppId, tlsValid: app.tlsValid, tlsExpiresAt: app.tlsExpiresAt, tlsCheckedAt: app.tlsCheckedAt }, notFound: false, ambiguous: false }
  }
  if (project.apps.length > 0) {
    const app = project.apps.find((item) => item.coolifyAppId) ?? getPrimaryApp(project.apps) ?? project.apps[0]!
    return { target: { id: app.id, coolifyAppId: app.coolifyAppId, tlsValid: app.tlsValid, tlsExpiresAt: app.tlsExpiresAt, tlsCheckedAt: app.tlsCheckedAt }, notFound: false, ambiguous: false }
  }
  return {
    target: { id: null, coolifyAppId: project.coolifyAppId, tlsValid: project.tlsValid, tlsExpiresAt: project.tlsExpiresAt, tlsCheckedAt: project.tlsCheckedAt },
    notFound: false,
    ambiguous: false,
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
  const { target, notFound, ambiguous } = resolveTarget(project, requestedAppId)
  if (ambiguous) return NextResponse.json({ error: APP_ID_REQUIRED }, { status: 400 })
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

  const mutateLimit = await checkOrg(org.organizationId, 'runtime-action', 30, 60_000)
  if (!mutateLimit.allowed) {
    return rateLimitedResponse(
      mutateLimit,
      'Trop d’actions d’exécution pour cette organisation en peu de temps. Patientez une minute.',
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
  const { target, notFound, ambiguous } = resolveTarget(project, requestedAppId)
  if (ambiguous) return NextResponse.json({ error: APP_ID_REQUIRED }, { status: 400 })
  if (notFound) return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
  if (!target.coolifyAppId) {
    return NextResponse.json({ error: "Cette application n'a pas encore été déployée." }, { status: 409 })
  }

  const result = await applicationAction(target.coolifyAppId, parsed.data.action as ApplicationAction)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, appId: target.id })
}
