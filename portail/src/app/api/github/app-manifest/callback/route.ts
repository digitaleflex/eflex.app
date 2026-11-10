import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { getSession } from '@/lib/session'
import { exchangeManifestCode, saveAppConfig } from '@/lib/github-app'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATE_COOKIE = 'eflex-gh-manifest'

function redirect(request: NextRequest, query: string): NextResponse {
  const base = process.env.BETTER_AUTH_URL?.replace(/\/+$/, '') || request.nextUrl.origin
  return NextResponse.redirect(`${base}/dashboard/settings?${query}`)
}

/** Callback GitHub du flux manifest : échange le code et enregistre l'App chiffrée en base. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!isAdmin(session)) {
    return new NextResponse('Introuvable', { status: 404 })
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const store = await cookies()
  const expected = store.get(STATE_COOKIE)?.value
  store.delete({ name: STATE_COOKIE, path: '/api/github/app-manifest' })

  if (!code || !state || !expected || state !== expected) {
    return redirect(request, 'github=state-error')
  }

  try {
    const app = await exchangeManifestCode(code)
    await saveAppConfig({
      appId: String(app.id),
      slug: app.slug,
      privateKey: app.pem,
      webhookSecret: app.webhookSecret,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
    })
    return redirect(request, 'github=app-created')
  } catch (error) {
    console.error('[github/app-manifest] création impossible', error instanceof Error ? error.message : error)
    return redirect(request, 'github=app-error')
  }
}
