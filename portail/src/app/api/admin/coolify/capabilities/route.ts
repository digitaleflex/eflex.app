import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { listDatabaseEngineCapabilities } from '@/lib/database-capabilities'
import { noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Capacités Coolify et support des moteurs de bases managées (détection version/registre). */
export async function GET(request: NextRequest) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response

  const force = request.nextUrl.searchParams.get('force') === '1'
  const { runtime, engines } = await listDatabaseEngineCapabilities({ force })
  return NextResponse.json(
    {
      runtime,
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
