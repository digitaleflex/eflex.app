import { notFound, redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { hasAdminPermission, normalizeAdminRole, type AdminPermission } from '@/lib/admin-rbac'

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>

function adminUser(session: Session | null): { role: string | null; banned: boolean; twoFactorEnabled: boolean } | null {
  const user = session?.user as { role?: string | null; banned?: boolean | null; twoFactorEnabled?: boolean | null } | undefined
  if (!user) return null
  return { role: user.role ?? null, banned: Boolean(user.banned), twoFactorEnabled: Boolean(user.twoFactorEnabled) }
}

export function adminTwoFactorRequired(now = Date.now()): boolean {
  const deadline = adminTwoFactorDeadline()
  if (deadline === 'never') return false
  if (deadline === null) return true
  return now >= deadline.getTime()
}

/** Date limite de grâce 2FA admin : null = enforcement immédiat, 'never' = désactivé. */
export function adminTwoFactorDeadline(): Date | 'never' | null {
  const raw = process.env.ADMIN_2FA_ENFORCE_AFTER?.trim() || ''
  if (raw.toLowerCase() === 'never') return 'never'
  if (!raw) return null
  const ms = Date.parse(raw)
  if (Number.isNaN(ms)) return null
  return new Date(ms)
}

function isAdminRoleSession(session: Session | null): session is Session {
  const user = adminUser(session)
  return Boolean(user && !user.banned && normalizeAdminRole(user.role))
}

/** Vrai pour un compte administrateur de la plateforme non suspendu. */
export function isAdmin(session: Session | null): session is Session {
  return isAdminRoleSession(session)
}

/** Vrai si la session a une permission admin donnée. */
export function canAdmin(session: Session | null, permission: AdminPermission): session is Session {
  const user = adminUser(session)
  return Boolean(user && !user.banned && hasAdminPermission(user.role, permission))
}

function adminTwoFactorBlocked(session: Session | null): boolean {
  if (!isAdminRoleSession(session)) return false
  const user = adminUser(session)
  return Boolean(user && !user.twoFactorEnabled && adminTwoFactorRequired())
}

/**
 * Garde des pages d'administration : tout autre visiteur reçoit un 404, pas un 403,
 * pour ne pas révéler l'existence de la zone. Une permission peut être exigée.
 * Les admins sans 2FA sont redirigés vers l'activation (ADM-2).
 */
export async function requireAdminPage(permission?: AdminPermission): Promise<Session> {
  const session = await getSession()
  const allowed = permission ? canAdmin(session, permission) : isAdmin(session)
  if (!allowed) notFound()
  if (adminTwoFactorBlocked(session)) redirect('/dashboard/settings?admin2fa=required#securite')
  return session as Session
}

/** Garde des routes `api/admin/**` : même règle, réponse 404 JSON. */
export async function requireAdminApi(
  permission?: AdminPermission,
): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession()
  const allowed = permission ? canAdmin(session, permission) : isAdmin(session)
  if (!allowed) return { response: NextResponse.json({ error: 'Introuvable' }, { status: 404 }) }
  if (adminTwoFactorBlocked(session)) {
    return {
      response: NextResponse.json(
        { error: 'La double authentification est obligatoire pour accéder à l’administration.', code: 'ADMIN_2FA_REQUIRED' },
        { status: 403 },
      ),
    }
  }
  return { session: session as Session }
}
