import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { installationExists } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

const schema = z.object({
  installationId: z.string().trim().regex(/^\d+$/, 'Identifiant d’installation invalide.'),
})

/** Relie l'installation GitHub App renvoyée par le redirect au compte connecté. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides.' }, { status: 400 })
  }

  // On vérifie auprès de GitHub que l'installation existe bien pour notre App :
  // un utilisateur ne peut pas s'approprier un identifiant arbitraire.
  let accountLogin: string | null
  try {
    accountLogin = await installationExists(parsed.data.installationId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GitHub App indisponible.' },
      { status: 502 },
    )
  }
  if (!accountLogin) {
    return NextResponse.json({ error: 'Installation GitHub introuvable.' }, { status: 404 })
  }

  const installation = await prisma.gitInstallation.upsert({
    where: { installationId: parsed.data.installationId },
    create: {
      userId: session.user.id,
      installationId: parsed.data.installationId,
      accountLogin,
    },
    update: { userId: session.user.id, accountLogin },
  })

  return NextResponse.json({ installation: { id: installation.id, accountLogin } })
}
