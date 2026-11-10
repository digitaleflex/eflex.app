import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

/**
 * Termine une usurpation et restaure la session de l'administrateur.
 * Accessible à la session usurpée elle-même : la garde admin ne s'applique pas.
 */
export async function POST() {
  const session = await getSession()
  const impersonatedBy = session?.session?.impersonatedBy
  if (!session?.user?.id || !impersonatedBy) {
    return NextResponse.json({ error: "Vous n'êtes pas en train d'utiliser un autre compte." }, { status: 400 })
  }

  const admin = await prisma.user.findUnique({
    where: { id: impersonatedBy },
    select: { id: true, email: true },
  })

  try {
    await auth.api.stopImpersonating({ headers: await headers() })
  } catch {
    return NextResponse.json({ error: "Impossible de restaurer votre session d'administrateur." }, { status: 500 })
  }

  if (admin) {
    await audit({
      actor: { id: admin.id, email: admin.email },
      action: 'user.stop_impersonate',
      target: { type: 'user', id: session.user.id },
      details: { targetEmail: session.user.email, targetName: session.user.name },
    })
  }

  return NextResponse.json({ ok: true })
}
