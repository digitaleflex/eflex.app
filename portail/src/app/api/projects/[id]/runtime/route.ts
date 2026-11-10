import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { applicationAction, getApplicationRuntime, type ApplicationAction } from '@/lib/coolify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
})

async function findProject(id: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      coolifyAppId: true,
      domain: true,
      tlsValid: true,
      tlsExpiresAt: true,
      tlsCheckedAt: true,
    },
  })
}

/** Statut runtime Coolify + dernier contrôle TLS (lecture seule). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const { id } = await params
  const project = await findProject(id, org.organizationId)
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const tls = {
    valid: project.tlsValid,
    expiresAt: project.tlsExpiresAt?.toISOString() ?? null,
    checkedAt: project.tlsCheckedAt?.toISOString() ?? null,
  }

  if (!project.coolifyAppId) {
    return NextResponse.json({ deployed: false, app: null, tls })
  }

  const runtime = await getApplicationRuntime(project.coolifyAppId)
  if ('error' in runtime) {
    return NextResponse.json({ deployed: true, app: null, tls, error: runtime.error })
  }
  return NextResponse.json({ deployed: true, app: runtime, tls })
}

/** Démarre, arrête ou redémarre l'application Coolify du projet. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const org = await resolveOrganization(session)
  if (!org) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas cette action.' }, { status: 403 })
  }

  const { id } = await params
  const project = await findProject(id, org.organizationId)
  if (!project) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  if (!project.coolifyAppId) {
    return NextResponse.json({ error: "Ce projet n'a pas encore été déployé." }, { status: 409 })
  }

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

  const result = await applicationAction(project.coolifyAppId, parsed.data.action as ApplicationAction)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
