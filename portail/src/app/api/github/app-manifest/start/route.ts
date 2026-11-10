import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATE_COOKIE = 'eflex-gh-manifest'

function htmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function baseUrl(request: NextRequest): string {
  return process.env.BETTER_AUTH_URL?.replace(/\/+$/, '') || request.nextUrl.origin
}

/**
 * Démarre le flux « GitHub App Manifest » : GitHub crée l'application à partir du
 * manifeste ci-dessous, puis renvoie ses identifiants au callback (sans copier-coller
 * de clé privée). Réservé aux administrateurs de la plateforme.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!isAdmin(session)) {
    return new NextResponse('Introuvable', { status: 404 })
  }

  const base = baseUrl(request)
  const org = (request.nextUrl.searchParams.get('org') ?? '').trim()
  const target = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(org)
    ? `https://github.com/organizations/${org}/settings/apps/new`
    : 'https://github.com/settings/apps/new'

  const state = randomBytes(24).toString('hex')
  const store = await cookies()
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/github/app-manifest',
    maxAge: 600,
  })

  const manifest = {
    name: 'Eflex',
    url: base,
    hook_attributes: { url: `${base}/api/webhooks/github`, active: true },
    redirect_url: `${base}/api/github/app-manifest/callback`,
    callback_urls: [`${base}/api/github/oauth/callback`],
    setup_url: `${base}/dashboard/new`,
    setup_on_update: true,
    public: true,
    default_permissions: {
      contents: 'read',
      metadata: 'read',
      administration: 'write',
    },
    default_events: ['push'],
  }

  const action = `${target}?state=${encodeURIComponent(state)}`
  const manifestJson = htmlEscape(JSON.stringify(manifest))

  return new NextResponse(
    `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Création de la GitHub App Eflex</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#111}button{min-height:2.75rem;padding:0 1.25rem;border:0;border-radius:.5rem;background:#2563eb;color:#fff;font:inherit;font-weight:600;cursor:pointer}</style>
</head>
<body>
<h1>Création de la GitHub App Eflex</h1>
<p>Vous allez être redirigé vers GitHub pour créer l’application. Vérifiez les permissions demandées puis confirmez.</p>
<form method="post" action="${htmlEscape(action)}">
  <input type="hidden" name="manifest" value="${manifestJson}">
  <button type="submit">Continuer vers GitHub</button>
</form>
<script>document.forms[0].submit()</script>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}
