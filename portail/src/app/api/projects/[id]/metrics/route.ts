import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { resolveOrganization } from '@/lib/organizations'
import { getApplicationMetrics } from '@/lib/coolify'
import { allow } from '@/lib/rate-limit'
import { getPrimaryApp } from '@/lib/project-apps'

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

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, organizationId: org.organizationId },
    select: {
      id: true,
      coolifyAppId: true,
      apps: {
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, position: true, coolifyAppId: true },
      },
    },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const requestedAppId = new URL(request.url).searchParams.get('appId')?.trim() || null

  let targetApp: { id: string; coolifyAppId: string | null } | null = null
  if (requestedAppId) {
    targetApp = project.apps.find((app) => app.id === requestedAppId) ?? null
    if (!targetApp) {
      return NextResponse.json({ error: 'Application introuvable.' }, { status: 404 })
    }
  } else if (project.apps.length > 0) {
    targetApp =
      project.apps.find((app) => app.coolifyAppId) ??
      getPrimaryApp(project.apps) ??
      project.apps[0] ??
      null
  }

  const coolifyAppId = project.apps.length > 0 ? (targetApp?.coolifyAppId ?? null) : project.coolifyAppId
  if (!coolifyAppId) {
    return NextResponse.json(
      { error: "Cette application n'a pas encore été déployée." },
      { status: 409 },
    )
  }

  const metrics = await getApplicationMetrics(coolifyAppId)

  return NextResponse.json(
    { metrics, appId: targetApp?.id ?? null },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
