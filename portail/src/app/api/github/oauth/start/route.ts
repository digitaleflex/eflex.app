import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { GITHUB_OAUTH_INSTALL_COOKIE, GITHUB_OAUTH_STATE_COOKIE, getOAuthConfig } from '@/lib/github-app'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function baseUrl(request: NextRequest): string {
  return process.env.BETTER_AUTH_URL?.replace(/\/+$/, '') || request.nextUrl.origin
}

/**
 * Autorisation utilisateur GitHub (OAuth) après l'installation de l'App.
 * Elle sert uniquement à prouver que l'installation appartient au compte connecté :
 * `GET /user/installations` est ensuite comparé à l'`installation_id` reçu.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl(request)}/login`)
  }

  const installationId = request.nextUrl.searchParams.get('installation_id') ?? ''
  if (!/^\d+$/.test(installationId)) {
    return NextResponse.redirect(`${baseUrl(request)}/dashboard/settings?github=install-error`)
  }

  const oauth = await getOAuthConfig()
  if (!oauth) {
    return NextResponse.redirect(`${baseUrl(request)}/dashboard/new?github=oauth-missing`)
  }

  const state = randomBytes(24).toString('hex')
  const store = await cookies()
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/github/oauth',
    maxAge: 900,
  }
  store.set(GITHUB_OAUTH_STATE_COOKIE, state, cookieOptions)
  store.set(GITHUB_OAUTH_INSTALL_COOKIE, installationId, cookieOptions)

  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', oauth.clientId)
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('redirect_uri', `${baseUrl(request)}/api/github/oauth/callback`)
  return NextResponse.redirect(authorize)
}
