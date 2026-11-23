import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { deleteScheduledTask, updateScheduledTask } from '@/lib/coolify'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { requireManagedProject } from '@/lib/tenant'
import { z } from 'zod'
import {
  validateContainerName,
  validateCronExpression,
  validateTaskCommand,
  validateTaskName,
} from '@/lib/scheduled-task-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const patchSchema = z.object({
  appId: z.string().min(1).optional(),
  name: z.string().min(1).max(120).refine(validateTaskName, 'Nom invalide.').optional(),
  command: z.string().min(1).max(4000).refine(validateTaskCommand, 'Commande invalide : une seule ligne, sans caractère de contrôle.').optional(),
  frequency: z.string().min(1).max(120).refine(validateCronExpression, 'Planification invalide (5 champs cron ou hourly/daily/weekly/monthly).').optional(),
  containerName: z.string().min(1).max(200).refine(validateContainerName, 'Nom de conteneur invalide.').optional().nullable(),
  enabled: z.boolean().optional(),
})

function pickApp(
  apps: Array<{ id: string; coolifyAppId: string | null; position: number }>,
  requestedId?: string | null,
) {
  if (requestedId) return apps.find((app) => app.id === requestedId) ?? null
  return [...apps].sort((a, b) => a.position - b.position)[0] ?? apps[0] ?? null
}

async function resolveTarget(
  session: { user: { id: string }; session: { activeOrganizationId?: string | null } },
  projectId: string,
  requestedAppId?: string | null,
) {
  const result = await requireManagedProject(session, projectId, {
    id: true,
    apps: { orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, coolifyAppId: true, position: true } },
  })
  if ('response' in result) return { response: result.response as NextResponse }
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) {
    return { response: NextResponse.json({ error: 'Votre rôle ne permet pas de modifier les tâches planifiées.' }, { status: 403 }) }
  }
  const target = pickApp(result.project.apps, requestedAppId)
  if (!target?.coolifyAppId) {
    return { response: NextResponse.json({ error: 'Application non déployée sur l’hébergement.' }, { status: 409 }) }
  }
  return { target }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, taskId } = await params
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
  const resolved = await resolveTarget(session, id, parsed.data.appId ?? null)
  if ('response' in resolved) return resolved.response
  const updated = await updateScheduledTask(resolved.target.coolifyAppId as string, taskId, {
    name: parsed.data.name?.trim(),
    command: parsed.data.command?.trim(),
    frequency: parsed.data.frequency?.trim(),
    containerName: parsed.data.containerName === null ? null : parsed.data.containerName?.trim(),
    enabled: parsed.data.enabled,
  })
  if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id, taskId } = await params
  const url = new URL(request.url)
  const appId = url.searchParams.get('appId')
  const resolved = await resolveTarget(session, id, appId)
  if ('response' in resolved) return resolved.response
  const deleted = await deleteScheduledTask(resolved.target.coolifyAppId as string, taskId)
  if ('error' in deleted) return NextResponse.json({ error: deleted.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
