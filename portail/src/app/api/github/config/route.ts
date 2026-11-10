import { NextResponse } from 'next/server'
import { getAppConfig, getOAuthConfig, installationUrl } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

/** État de la GitHub App et URL d'installation pour l'interface. */
export async function GET() {
  const config = await getAppConfig()
  return NextResponse.json(
    {
      configured: Boolean(config),
      oauthConfigured: Boolean(await getOAuthConfig()),
      slug: config?.slug ?? null,
      installationUrl: await installationUrl(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
