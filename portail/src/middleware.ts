import { NextResponse, type NextRequest } from 'next/server'

/**
 * Runtime Node.js : MAINTENANCE_MODE est lu à l'exécution (variable du
 * conteneur), et non figé dans le bundle au moment du build.
 */
export const runtime = 'nodejs'

const ALLOWED_PATHS = new Set([
  '/maintenance',
  // La page de statut doit rester consultable pendant un incident ou une maintenance.
  '/status',
  '/api/health',
  '/api/status',
  '/api/maintenance',
  '/robots.txt',
  '/icon.png',
  '/apple-icon.png',
  '/favicon.ico',
  '/logo-horizontal.webp',
])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (process.env.MAINTENANCE_MODE !== 'true') return NextResponse.next()
  if (pathname.startsWith('/_next/') || ALLOWED_PATHS.has(pathname)) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = '/maintenance'
  const response = NextResponse.rewrite(url, { status: 503 })
  response.headers.set('x-eflex-maintenance', '1')
  response.headers.set('Retry-After', '300')
  return response
}

export const config = {
  // Les ressources statiques restent servies normalement (CSS, JS, images).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)',
  ],
}
