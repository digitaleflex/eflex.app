import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createScheduledTask, listScheduledTasks } from '@/lib/coolify'
import { canManageProjects } from '@/lib/organizations'
import { requireManagedProject } from '@/lib/tenant'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import {
  validateContainerName,
  validateCronExpression,
  validateTaskCommand,
  validateTaskName,
} from '@/lib/scheduled-task-validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const createSchema = z.object({
  appId: z.string().min(1).optional(),
  name: z.string().min(1).max(120).refine(validateTaskName, 'Nom invalide.'),
  command: z.string().min(1).max(4000).refine(validateTaskCommand, 'Commande invalide : une seule ligne, sans caractère de contrôle.'),
  frequency: z.string().min(1).max(120).refine(validateCronExpression, 'Planification invalide (5 champs cron ou hourly/daily/weekly/monthly).'),
  containerName: z.string().min(1).max(200).refine(validateContainerName, 'Nom de conteneur invalide.').optional().nullable(),
  enabled: z.boolean().optional(),
})

function pickApp(
  apps: Array<{ id: string; name: string; coolifyAppId: string | null; position: number }>,
  requestedId?: string | null,
) {
  if (requestedId) return apps.find((app) => app.id === requestedId) ?? null
  return [...apps].sort((a, b) => a.position - b.position)[0] ?? apps[0] ?? null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const url = new URL(request.url)
  const requestedAppId = url.searchParams.get('appId')
  const result = await requireManagedProject(session, id, {
    id: true,
    apps: { orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, coolifyAppId: true, position: true } },
  })
  if ('response' in result) return result.response

  const target = pickApp(result.project.apps, requestedAppId)
  if (!target?.coolifyAppId) {
    return NextResponse.json({ tasks: [], appId: target?.id ?? null, unavailable: 'Application non déployée sur l’hébergement.' })
  }

  const tasks = await listScheduledTasks(target.coolifyAppId)
  if ('error' in tasks) return NextResponse.json({ error: tasks.error }, { status: 502 })
  return NextResponse.json({ tasks: tasks.tasks, appId: target.id, appName: target.name })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const result = await requireManagedProject(session, id, {
    id: true,
    organizationId: true,
    apps: { orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, coolifyAppId: true, position: true } },
  })
  if ('response' in result) return result.response
  // role check: requireManagedProject resolves org via session but doesn't expose role here; need canManage
  const { resolveOrganization } = await import('@/lib/organizations')
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de modifier les tâches planifiées.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides.', details: parsed.error.flatten() }, { status: 400 })
  }

  const target = pickApp(result.project.apps, parsed.data.appId ?? null)
  if (!target?.coolifyAppId) {
    return NextResponse.json({ error: 'Application non déployée sur l’hébergement.' }, { status: 409 })
  }

  const created = await createScheduledTask(target.coolifyAppId, {
    name: parsed.data.name.trim(),
    command: parsed.data.command.trim(),
    frequency: parsed.data.frequency.trim(),
    containerName: parsed.data.containerName?.trim() || undefined,
    enabled: parsed.data.enabled,
  })
  if ('error' in created) return NextResponse.json({ error: created.error }, { status: 502 })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'project.scheduled-task.create',
    target: { type: 'project', id },
    organizationId: org.organizationId,
    // Jamais la commande : elle peut contenir des secrets.
    details: { name: parsed.data.name.trim(), frequency: parsed.data.frequency.trim(), appId: target.id },
    request,
  })
  return NextResponse.json({ id: created.id, appId: target.id }, { status: 201 })
}
