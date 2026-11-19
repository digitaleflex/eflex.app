import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { allowIp } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { audit, redact } from '@/lib/audit'
import { publish } from '@/lib/event-bus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  if (aa.length !== bb.length) return false
  return timingSafeEqual(aa, bb)
}

function extractSecret(request: NextRequest): string | null {
  const auth = request.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return (
    request.headers.get('x-coolify-webhook-secret') ??
    request.headers.get('x-webhook-secret') ??
    request.headers.get('x-coolify-signature') ??
    request.headers.get('x-signature') ??
    null
  )
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300)
  }
  return null
}

function normalizePayload(raw: unknown): {
  event: string
  title: string | null
  message: string | null
  status: string | null
  resource: string | null
  details: Record<string, unknown>
} {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const nested = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? (obj.data as Record<string, unknown>) : {}
  const event =
    pickString(obj, ['event', 'type', 'topic', 'name']) ??
    pickString(nested, ['event', 'type', 'topic', 'name']) ??
    'notification'
  const title = pickString(obj, ['title', 'subject', 'app_name', 'application_name']) ?? pickString(nested, ['title', 'subject', 'app_name', 'application_name'])
  const message = pickString(obj, ['message', 'description', 'body', 'text']) ?? pickString(nested, ['message', 'description', 'body', 'text'])
  const status = pickString(obj, ['status', 'level', 'severity', 'state']) ?? pickString(nested, ['status', 'level', 'severity', 'state'])
  const resource =
    pickString(obj, ['application_uuid', 'application_id', 'service_uuid', 'service_id', 'server_uuid', 'resource_uuid', 'uuid', 'id']) ??
    pickString(nested, ['application_uuid', 'application_id', 'service_uuid', 'service_id', 'server_uuid', 'resource_uuid', 'uuid', 'id']) ??
    pickString(obj, ['app_name', 'application_name', 'service_name', 'server_name', 'project_name']) ??
    pickString(nested, ['app_name', 'application_name', 'service_name', 'server_name', 'project_name'])

  // Détails sûrs uniquement (redact supprime les secrets par clé).
  const details: Record<string, unknown> = {
    event,
    title,
    message,
    status,
    resource,
    success: typeof obj.success === 'boolean' ? obj.success : typeof nested.success === 'boolean' ? nested.success : undefined,
    project: pickString(obj, ['project_name', 'project_uuid']) ?? pickString(nested, ['project_name', 'project_uuid']),
    server: pickString(obj, ['server_name', 'server_uuid']) ?? pickString(nested, ['server_name', 'server_uuid']),
  }
  return { event, title, message, status, resource, details }
}

/**
 * Réception des notifications/webhooks Coolify (issue #186).
 * Sécurisé par secret partagé (`COOLIFY_WEBHOOK_INBOUND_SECRET`) ; déduplication par livraison.
 * Les événements sont journalisés (audit admin) et publiés en temps réel (audience admin) sans exposer de secrets.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  if (!(await allowIp(request, 'webhook:coolify', 120, 60_000))) {
    return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429 })
  }

  const expected = process.env.COOLIFY_WEBHOOK_INBOUND_SECRET?.trim()
  if (!expected) {
    return NextResponse.json({ error: 'Réception Coolify non configurée.' }, { status: 503 })
  }
  const provided = extractSecret(request)
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Secret invalide.' }, { status: 401 })
  }

  const deliveryIdHeader =
    request.headers.get('x-coolify-delivery') ??
    request.headers.get('x-delivery-id') ??
    request.headers.get('x-request-id') ??
    request.headers.get('svix-id')
  const deliveryId =
    deliveryIdHeader && deliveryIdHeader.trim()
      ? `coolify:${deliveryIdHeader.trim().slice(0, 180)}`
      : `coolify:${createHash('sha256').update(body).digest('hex')}`

  try {
    await prisma.webhookDelivery.create({ data: { id: deliveryId } })
  } catch {
    return NextResponse.json({ received: true, duplicate: true })
  }

  let payload: unknown
  try {
    payload = body ? JSON.parse(body) : {}
  } catch {
    payload = { raw: body.slice(0, 500) }
  }

  const normalized = normalizePayload(payload)
  const targetId = normalized.resource ?? 'unknown'

  try {
    await audit({
      actor: { id: 'system:coolify', email: 'coolify@system.local' },
      action: 'platform.coolify.notification',
      target: { type: 'coolify', id: targetId },
      details: redact(normalized.details),
      request,
    })
  } catch (error) {
    console.error('[eflex/webhook/coolify] audit impossible', error)
  }

  try {
    await publish({
      type: 'coolify.notification',
      audience: 'admin',
      payload: {
        event: normalized.event,
        title: normalized.title,
        message: normalized.message ? normalized.message.slice(0, 500) : null,
        status: normalized.status,
        resource: normalized.resource,
      },
    })
  } catch (error) {
    console.error('[eflex/webhook/coolify] publication impossible', error)
  }

  return NextResponse.json({ received: true })
}
