import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getApplicationAdvancedConfig, updateApplicationAdvancedConfig } from '@/lib/coolify'
import { canManageProjects, resolveOrganization } from '@/lib/organizations'
import { requireManagedProject } from '@/lib/tenant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function pickApp(
  apps: Array<{ id: string; name: string; coolifyAppId: string | null; position: number }>,
  requestedId?: string | null,
) {
  if (requestedId) return apps.find((app) => app.id === requestedId) ?? null
  return [...apps].sort((a, b) => a.position - b.position)[0] ?? apps[0] ?? null
}

const patchSchema = z.object({
  appId: z.string().min(1).optional(),
  config: z.object({
    healthCheckEnabled: z.boolean().optional(),
    healthCheckPath: z.string().max(500).optional(),
    healthCheckMethod: z.string().max(16).optional(),
    healthCheckPort: z.string().max(10).optional(),
    healthCheckHost: z.string().max(255).optional(),
    healthCheckScheme: z.enum(['http', 'https']).optional(),
    healthCheckReturnCode: z.number().int().min(100).max(599).optional(),
    healthCheckResponseText: z.string().max(500).optional(),
    healthCheckInterval: z.number().int().min(1).max(3600).optional(),
    healthCheckTimeout: z.number().int().min(1).max(3600).optional(),
    healthCheckRetries: z.number().int().min(1).max(100).optional(),
    healthCheckStartPeriod: z.number().int().min(0).max(3600).optional(),
    watchPaths: z.string().max(2000).optional(),
    limitsCpus: z.string().max(32).optional(),
    limitsMemory: z.string().max(32).optional(),
    limitsMemorySwap: z.string().max(32).optional(),
    limitsMemoryReservation: z.string().max(32).optional(),
  }),
})

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
    return NextResponse.json({ config: null, appId: target?.id ?? null, unavailable: 'Application non déployée sur l’hébergement.' })
  }
  const config = await getApplicationAdvancedConfig(target.coolifyAppId)
  if ('error' in config) return NextResponse.json({ error: config.error }, { status: 502 })
  return NextResponse.json({ config, appId: target.id, appName: target.name })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { id } = await params
  const result = await requireManagedProject(session, id, {
    id: true,
    apps: { orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, coolifyAppId: true, position: true } },
  })
  if ('response' in result) return result.response
  const org = await resolveOrganization(session)
  if (!org || !canManageProjects(org.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de modifier la configuration applicative.' }, { status: 403 })
  }
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides.', details: parsed.error.flatten() }, { status: 400 })
  const target = pickApp(result.project.apps, parsed.data.appId ?? null)
  if (!target?.coolifyAppId) return NextResponse.json({ error: 'Application non déployée sur l’hébergement.' }, { status: 409 })

  const c = parsed.data.config
  const updated = await updateApplicationAdvancedConfig(target.coolifyAppId, {
    ...c,
    healthCheckPath: c.healthCheckPath?.trim(),
    healthCheckMethod: c.healthCheckMethod?.trim().toUpperCase(),
    healthCheckPort: c.healthCheckPort?.trim(),
    healthCheckHost: c.healthCheckHost?.trim(),
    healthCheckResponseText: c.healthCheckResponseText ?? '',
    watchPaths: c.watchPaths?.trim(),
    limitsCpus: c.limitsCpus?.trim(),
    limitsMemory: c.limitsMemory?.trim(),
    limitsMemorySwap: c.limitsMemorySwap?.trim(),
    limitsMemoryReservation: c.limitsMemoryReservation?.trim(),
  })
  if ('error' in updated) return NextResponse.json({ error: updated.error }, { status: 502 })
  return NextResponse.json({ ok: true, appId: target.id })
}
