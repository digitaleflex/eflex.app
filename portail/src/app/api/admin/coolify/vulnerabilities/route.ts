import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin'
import { listVulnerabilities } from '@/lib/coolify-admin'
import { coolifyError, noStore } from '../guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** État de sécurité des images de toutes les ressources (analyse Syft + Grype de Coolify). */
export async function GET() {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const resources = await listVulnerabilities()
  if ('error' in resources) return coolifyError(resources.error)
  return NextResponse.json({ resources }, noStore)
}
