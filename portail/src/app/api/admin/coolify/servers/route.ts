import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { coolifyFetch } from '@/lib/coolify'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Serveurs Coolify (nom, adresse, état), sans réglage sensible. */
export async function GET() {
  const guard = await requireAdminApi('admin.coolify.read')
  if ('response' in guard) return guard.response

  const res = await coolifyFetch<unknown>('/servers', { signal: AbortSignal.timeout(8_000) })
  if (res.error) return coolifyError(res.error)
  const servers = (Array.isArray(res.data) ? res.data : [])
    .map((item) => {
      const data = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const settings = (data.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<string, unknown>
      if (typeof data.uuid !== 'string') return null
      return {
        id: data.uuid,
        name: typeof data.name === 'string' ? data.name : data.uuid,
        ip: typeof data.ip === 'string' ? data.ip : null,
        reachable: settings.is_reachable === true || data.is_reachable === true,
        usable: settings.is_usable === true || data.is_usable === true,
        buildServer: settings.is_build_server === true,
        coolifyHost: data.is_coolify_host === true,
      }
    })
    .filter((server) => server !== null)
  return NextResponse.json({ servers }, noStore)
}
