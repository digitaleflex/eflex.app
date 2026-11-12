import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getApplicationMetrics, getApplicationRuntime } from '@/lib/coolify'
import { allow, allowOrg } from '@/lib/rate-limit'
import { getPrimaryApp } from '@/lib/project-apps'
import { requireOrg, requireProject, tenantNotFound } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Métriques CPU/RAM d'une application, en mode dégradé si non exposées. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (!(await allow(`runtime-metrics:${session.user.id}`, 30, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de lectures de métriques. Patientez une minute.' },
      { status: 429 },
    )
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!(await allowOrg(org.organizationId, 'runtime-metrics', 120, 60_000))) {
    return NextResponse.json(
      { error: 'Trop de lectures de métriques pour cette organisation en peu de temps. Patientez une minute.' },
      { status: 429 },
    )
  }

  const { id } = await params
  const projectResult = await requireProject(org, id, {
    id: true,
    coolifyAppId: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, coolifyAppId: true },
    },
  })
  if ('response' in projectResult) return projectResult.response
  const project = projectResult.project as {
    id: string
    coolifyAppId: string | null
    apps: Array<{ id: string; name: string; position: number; coolifyAppId: string | null }>
  }

  const requestedAppId = new URL(request.url).searchParams.get('appId')?.trim() || null

  let targetApp: { id: string; coolifyAppId: string | null } | null = null
  const apps = project.apps
  if (requestedAppId) {
    targetApp = apps.find((app) => app.id === requestedAppId) ?? null
    if (!targetApp) {
      return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
    }
  } else if (apps.length > 0) {
    targetApp =
      apps.find((app) => app.coolifyAppId) ??
      getPrimaryApp(apps) ??
      apps[0] ??
      null
  }

  const coolifyAppId = project.apps.length > 0 ? (targetApp?.coolifyAppId ?? null) : project.coolifyAppId
  if (!coolifyAppId) {
    return NextResponse.json(
      { error: "Cette application n'a pas encore été déployée." },
      { status: 409 },
    )
  }

  const [metrics, runtime] = await Promise.all([
    getApplicationMetrics(coolifyAppId),
    getApplicationRuntime(coolifyAppId, 5_000),
  ])

  const runtimeInfo =
    'error' in runtime
      ? {
          available: false as const,
          status: null,
          healthCheckEnabled: false,
          healthCheckPath: null,
          restartCount: null,
          lastRestartAt: null,
          restartReason: null,
          error: runtime.error,
        }
      : {
          available: true as const,
          status: runtime.status,
          healthCheckEnabled: runtime.healthCheckEnabled,
          healthCheckPath: runtime.healthCheckPath,
          restartCount: runtime.restartCount ?? null,
          lastRestartAt: runtime.lastRestartAt ?? null,
          restartReason: runtime.restartReason ?? null,
        }

  return NextResponse.json(
    { metrics, runtime: runtimeInfo, appId: targetApp?.id ?? null },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
