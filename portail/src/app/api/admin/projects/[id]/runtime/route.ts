import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin'
import { audit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { applicationAction, type ApplicationAction } from '@/lib/coolify'
import { REASON_MAX, REASON_MIN } from '@/lib/admin-projects'
import { collectCoolifyAppIds } from '@/lib/project-primary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
  reason: z.string().trim().max(REASON_MAX, 'Le motif est trop long (300 caractères maximum).').optional(),
})

const DESTRUCTIVE: ReadonlySet<ApplicationAction> = new Set<ApplicationAction>(['stop', 'restart'])

const LABELS: Record<ApplicationAction, string> = {
  start: 'démarrée',
  stop: 'arrêtée',
  restart: 'redémarrée',
}

/** Démarre, arrête ou redémarre les applications du projet (action auditée). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard

  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }
  const { action } = parsed.data
  const reason = parsed.data.reason?.trim() ?? ''

  if (DESTRUCTIVE.has(action) && reason.length < REASON_MIN) {
    return NextResponse.json(
      { error: `Indiquez un motif (${REASON_MIN} caractères minimum) : l’action interrompt le service.` },
      { status: 400 },
    )
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      organizationId: true,
      coolifyAppId: true,
      apps: { select: { coolifyAppId: true } },
    },
  })
  if (!project) return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })

  const appIds = project.apps.length > 0 ? collectCoolifyAppIds({ apps: project.apps }) : project.coolifyAppId ? [project.coolifyAppId] : []
  if (appIds.length === 0) {
    return NextResponse.json({ error: 'Ce projet n’a pas encore d’application sur l’infrastructure.' }, { status: 409 })
  }

  const results = await Promise.all(appIds.map((appId: string) => applicationAction(appId, action)))
  const failure = results.find((result: { error?: string } | unknown): result is { error: string } => Boolean(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)))
  if (failure) return NextResponse.json({ error: failure.error }, { status: 502 })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.runtime',
    target: { type: 'project', id: project.id },
    organizationId: project.organizationId,
    details: { action, coolifyAppIds: appIds, reason: reason || null },
    request,
  })

  const suffix = appIds.length > 1 ? ` (${appIds.length} applications)` : ''
  return NextResponse.json({ ok: true, action, message: `Application ${LABELS[action]}${suffix}.` })
}
