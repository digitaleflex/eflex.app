import { NextResponse } from 'next/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { requireAdminApi } from '@/lib/admin'
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/admin-rbac'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({
  role: z.enum(['user', ...ADMIN_ROLES]),
})

/**
 * Attribution/retrait de rôle administrateur (ADM-1).
 * Réservé aux super_admin, audité, impossible de retirer le dernier super_admin.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi('admin.roles.manage')
  if ('response' in guard) return guard.response
  const { session } = guard
  const { id } = await params

  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 })
  }

  if (id === session.user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas modifier votre propre rôle administrateur.' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!target) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })

  const nextRole = body.data.role === 'user' ? null : (body.data.role as AdminRole)
  const currentNormalized = target.role === 'admin' ? 'super_admin' : target.role
  const nextNormalized = nextRole

  if (currentNormalized === nextNormalized || (currentNormalized == null && nextNormalized == null)) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  if (currentNormalized === 'super_admin' && nextNormalized !== 'super_admin') {
    const superAdminCount = await prisma.user.count({ where: { role: 'super_admin' } })
    if (superAdminCount <= 1) {
      return NextResponse.json({ error: 'Impossible de retirer le dernier super administrateur.' }, { status: 409 })
    }
  }

  await prisma.user.update({ where: { id }, data: { role: nextRole } })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'user.role.change',
    target: { type: 'user', id: target.id },
    details: {
      targetEmail: target.email,
      targetName: target.name,
      previousRole: currentNormalized ?? 'user',
      nextRole: nextNormalized ?? 'user',
      previousRoleLabel: currentNormalized ? ADMIN_ROLE_LABELS[currentNormalized as AdminRole] ?? currentNormalized : 'Compte standard',
      nextRoleLabel: nextNormalized ? ADMIN_ROLE_LABELS[nextNormalized] : 'Compte standard',
    },
  })

  return NextResponse.json({ ok: true, role: nextNormalized ?? 'user' })
}
