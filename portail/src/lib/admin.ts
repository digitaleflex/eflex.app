import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>

/** Vrai pour un compte administrateur de la plateforme non suspendu. */
export function isAdmin(session: Session | null): session is Session {
  const user = session?.user as { role?: string | null; banned?: boolean | null } | undefined
  return Boolean(user && user.role === 'admin' && !user.banned)
}

/**
 * Garde des pages d'administration : tout autre visiteur reçoit un 404, pas un 403,
 * pour ne pas révéler l'existence de la zone.
 */
export async function requireAdminPage(): Promise<Session> {
  const session = await getSession()
  if (!isAdmin(session)) notFound()
  return session
}

/** Garde des routes `api/admin/**` : même règle, réponse 404 JSON. */
export async function requireAdminApi(): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession()
  if (!isAdmin(session)) return { response: NextResponse.json({ error: 'Introuvable' }, { status: 404 }) }
  return { session }
}
