import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

const banSchema = z.object({
  reason: z.string().trim().min(5, 'Indiquez un motif (5 caractères minimum).').max(300, 'Le motif est trop long (300 caractères maximum).'),
  days: z.number().int().min(1).max(365).optional(),
})

async function loadTarget(id: string, actorId: string) {
  if (id === actorId) {
    return { error: NextResponse.json({ error: 'Vous ne pouvez pas modifier votre propre compte.' }, { status: 400 }) }
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, role: true, banned: true } })
  if (!target) return { error: NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 }) }
  if (target.role === 'admin') {
    return { error: NextResponse.json({ error: "Retirez d'abord le rôle administrateur de ce compte." }, { status: 409 }) }
  }
  return { target }
}

/** Suspend un compte : motif obligatoire, sessions fermées, action auditée. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard
  const { id } = await params

  const parsed = banSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })

  const loaded = await loadTarget(id, session.user.id)
  if ('error' in loaded) return loaded.error

  await auth.api.banUser({
    headers: await headers(),
    body: { userId: id, banReason: parsed.data.reason, ...(parsed.data.days ? { banExpiresIn: parsed.data.days * 86_400 } : {}) },
  })
  // Fermeture explicite des sessions : le compte est coupé immédiatement.
  await prisma.session.deleteMany({ where: { userId: id } })

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'user.ban',
    target: { type: 'user', id },
    details: { targetEmail: loaded.target.email, reason: parsed.data.reason, days: parsed.data.days ?? null },
    request,
  })
  return NextResponse.json({ ok: true })
}

/** Réactive un compte suspendu. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard
  const { id } = await params

  const loaded = await loadTarget(id, session.user.id)
  if ('error' in loaded) return loaded.error

  await auth.api.unbanUser({ headers: await headers(), body: { userId: id } })
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'user.unban',
    target: { type: 'user', id },
    details: { targetEmail: loaded.target.email },
    request,
  })
  return NextResponse.json({ ok: true })
}
