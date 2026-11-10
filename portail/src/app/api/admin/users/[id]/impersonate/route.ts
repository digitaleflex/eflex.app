import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { requireAdminApi } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

/**
 * Ouvre une session « au nom de » l'utilisateur ciblé. Le cookie de session de
 * l'administrateur est conservé par Better Auth pour pouvoir revenir ensuite.
 * Chaque usurpation est auditée avec l'identité réelle de l'administrateur.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('response' in guard) return guard.response
  const { session } = guard
  const { id } = await params

  if (id === session.user.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas prendre la main sur votre propre compte.' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, banned: true },
  })
  if (!target) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
  if (target.role === 'admin') {
    return NextResponse.json({ error: "L'usurpation d'un compte administrateur est refusée." }, { status: 409 })
  }
  if (target.banned) {
    return NextResponse.json({ error: 'Ce compte est suspendu : réactivez-le avant de prendre la main.' }, { status: 409 })
  }

  try {
    await auth.api.impersonateUser({
      headers: await headers(),
      body: { userId: id },
    })
  } catch {
    return NextResponse.json({ error: "Impossible d'ouvrir la session d'usurpation." }, { status: 500 })
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: 'user.impersonate',
    target: { type: 'user', id: target.id },
    details: { targetEmail: target.email, targetName: target.name },
  })

  return NextResponse.json({ ok: true })
}
