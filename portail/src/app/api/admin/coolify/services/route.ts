import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { listCoolifyServices } from '@/lib/coolify-admin'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Liste des services déclarés dans Coolify (one-click/compose gérés par l’hébergement). */
export async function GET() {
  const guard = await requireAdminApi('admin.coolify.read')
  if ('response' in guard) return guard.response
  const services = await listCoolifyServices()
  if ('error' in services) return coolifyError(services.error)
  return NextResponse.json({ services }, noStore)
}
