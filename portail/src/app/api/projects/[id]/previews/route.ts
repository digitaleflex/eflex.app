import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageProjects } from '@/lib/organizations'
import { audit } from '@/lib/audit'
import { requireManagedProject, requireOrg, tenantNotFound } from '@/lib/tenant'
import { MAX_ACTIVE_PREVIEWS_PER_PROJECT, listProjectPreviews } from '@/lib/project-previews'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const patchSchema = z.object({
  enabled: z.boolean(),
})

function serialize(preview: {
  id: string
  appId: string
  prNumber: number
  prTitle: string | null
  prUrl: string | null
  headRef: string
  headSha: string | null
  baseRef: string | null
  authorLogin: string | null
  status: string
  previewUrl: string | null
  error: string | null
  lastDeployedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
  app: { id: string; name: string }
}) {
  return {
    id: preview.id,
    appId: preview.appId,
    appName: preview.app.name,
    prNumber: preview.prNumber,
    prTitle: preview.prTitle,
    prUrl: preview.prUrl,
    headRef: preview.headRef,
    headSha: preview.headSha,
    baseRef: preview.baseRef,
    authorLogin: preview.authorLogin,
    status: preview.status,
    previewUrl: preview.previewUrl,
    error: preview.error,
    lastDeployedAt: preview.lastDeployedAt?.toISOString() ?? null,
    closedAt: preview.closedAt?.toISOString() ?? null,
    createdAt: preview.createdAt.toISOString(),
    updatedAt: preview.updatedAt.toISOString(),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const scoped = await requireManagedProject(session, id, {
    id: true,
    previewsEnabled: true,
    repoFullName: true,
    repoUrl: true,
    apps: {
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, coolifyAppId: true, position: true },
    },
  })
  if ('response' in scoped) return scoped.response

  const previews = await listProjectPreviews(scoped.project.id)
  const primary = scoped.project.apps.find((app) => app.position === 0) ?? scoped.project.apps[0] ?? null
  const ready = Boolean(scoped.project.previewsEnabled && primary?.coolifyAppId)
  return NextResponse.json({
    enabled: scoped.project.previewsEnabled,
    ready,
    maxActive: MAX_ACTIVE_PREVIEWS_PER_PROJECT,
    previews: previews.map(serialize),
    guards: {
      sameRepositoryOnly: true,
      forksIgnored: true,
      draftsIgnoredUntilReady: true,
      secretsNote:
        'Les prévisualisations utilisent la configuration de l’application Coolify, y compris ses variables d’environnement. Ne les activez pas si des secrets de production sensibles ne doivent pas être exposés à du code de revue.',
    },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const org = await requireOrg(session)
  if (!org) return tenantNotFound('Projet introuvable')
  if (!canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de modifier ce projet.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 })
  }

  const { id } = await params
  const scoped = await requireManagedProject(session, id, { id: true, previewsEnabled: true })
  if ('response' in scoped) return scoped.response

  const project = await prisma.project.update({
    where: { id: scoped.project.id },
    data: { previewsEnabled: parsed.data.enabled },
    select: { id: true, previewsEnabled: true },
  })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.previews.toggle',
    target: { type: 'project', id: project.id },
    organizationId: org.organizationId,
    details: { enabled: project.previewsEnabled },
    request,
  })

  return NextResponse.json({ enabled: project.previewsEnabled })
}
