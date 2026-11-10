import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { GITHUB_INSTALL_STATE_COOKIE, installationUrl } from '@/lib/github-app'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Redirige vers l'installation GitHub App en posant un `state` lié à la session.
 * Le retour (`?installation_id=…&state=…`) n'est accepté que si l'installation a
 * été créée pendant ce flux : un utilisateur ne peut pas s'approprier un ID existant.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.redirect(new URL('/login', process.env.BETTER_AUTH_URL || 'http://localhost:3000'))

  const target = await installationUrl()
  if (!target) {
    return NextResponse.redirect(new URL('/dashboard/settings?github=not-configured', process.env.BETTER_AUTH_URL || 'http://localhost:3000'))
  }

  const state = randomBytes(24).toString('hex')
  const store = await cookies()
  store.set(GITHUB_INSTALL_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/github',
    maxAge: 900,
  })

  const url = new URL(target)
  url.searchParams.set('state', state)
  return NextResponse.redirect(url)
}
