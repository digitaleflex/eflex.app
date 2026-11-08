import { NextResponse } from 'next/server'
import { installationUrl } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

/** État de la GitHub App et URL d'installation pour l'interface. */
export async function GET() {
  return NextResponse.json(
    {
      configured: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
      installationUrl: installationUrl(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
