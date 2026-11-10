import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  GITHUB_OAUTH_INSTALL_COOKIE,
  GITHUB_OAUTH_STATE_COOKIE,
  exchangeUserCode,
  listUserInstallations,
} from '@/lib/github-app'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function baseUrl(request: NextRequest): string {
  return process.env.BETTER_AUTH_URL?.replace(/\/+$/, '') || request.nextUrl.origin
}

/** Callback OAuth : vérifie que l'installation est bien accessible à l'utilisateur connecté. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl(request)}/login`)
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const store = await cookies()
  const expectedState = store.get(GITHUB_OAUTH_STATE_COOKIE)?.value
  const installationId = store.get(GITHUB_OAUTH_INSTALL_COOKIE)?.value
  const options = { path: '/api/github/oauth' }
  store.delete({ name: GITHUB_OAUTH_STATE_COOKIE, ...options })
  store.delete({ name: GITHUB_OAUTH_INSTALL_COOKIE, ...options })

  if (!code || !state || !expectedState || state !== expectedState || !installationId) {
    return NextResponse.redirect(`${baseUrl(request)}/dashboard/new?github=oauth-state-error`)
  }

  try {
    const userToken = await exchangeUserCode(code, `${baseUrl(request)}/api/github/oauth/callback`)
    const installations = await listUserInstallations(userToken)
    const match = installations.find((item) => item.installationId === installationId)
    if (!match) {
      return NextResponse.redirect(`${baseUrl(request)}/dashboard/new?github=ownership-error`)
    }

    await prisma.gitInstallation.upsert({
      where: { installationId },
      create: { userId: session.user.id, installationId, accountLogin: match.accountLogin },
      update: { userId: session.user.id, accountLogin: match.accountLogin },
    })
    return NextResponse.redirect(`${baseUrl(request)}/dashboard/new?github=connected`)
  } catch (error) {
    console.error('[github/oauth] autorisation impossible', error instanceof Error ? error.message : error)
    return NextResponse.redirect(`${baseUrl(request)}/dashboard/new?github=oauth-error`)
  }
}
