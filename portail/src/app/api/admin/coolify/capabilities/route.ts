import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { getCoolifyWebhookNotification } from '@/lib/coolify-admin'
import { listDatabaseEngineCapabilities } from '@/lib/database-capabilities'
import { noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Capacités Coolify, notifications (entrant/sortant, best-effort) et support des moteurs de bases managées. */
export async function GET(request: NextRequest) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  const force = request.nextUrl.searchParams.get('force') === '1'
  const [{ runtime, engines }, outgoingWebhook] = await Promise.all([
    listDatabaseEngineCapabilities({ force }),
    getCoolifyWebhookNotification(),
  ])
  const webhookEndpoint = new URL('/api/webhooks/coolify', request.url).toString()
  return NextResponse.json(
    {
      runtime,
      webhookReceiver: {
        configured: Boolean(process.env.COOLIFY_WEBHOOK_INBOUND_SECRET?.trim()),
        endpoint: webhookEndpoint,
      },
      outgoingWebhook,
      engines: engines.map((engine) => ({
        kind: engine.kind,
        label: engine.label,
        envKey: engine.envKey,
        provisionSupported: engine.provisionSupported,
        lifecycleSupported: engine.lifecycleSupported,
        backupSupported: engine.backupSupported,
        restoreSupported: engine.restoreSupported,
        provider: engine.provider,
        ...(engine.reason ? { reason: engine.reason } : {}),
        notes: engine.notes,
      })),
    },
    noStore,
  )
}
