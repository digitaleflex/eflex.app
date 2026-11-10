import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Détache une installation GitHub du compte Eflex (sans la désinstaller de GitHub). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ installationId: string }> },
) {
  const session = await getSession()
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { installationId } = await params
  if (!/^\d+$/.test(installationId)) {
    return NextResponse.json({ error: 'Installation GitHub invalide.' }, { status: 400 })
  }

  const deleted = await prisma.gitInstallation.deleteMany({
    where: { userId: session.user.id, installationId },
  })
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Installation GitHub introuvable.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
