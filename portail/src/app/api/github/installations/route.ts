import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { GITHUB_INSTALL_STATE_COOKIE, installationExists } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

const schema = z.object({
  installationId: z.string().trim().regex(/^\d+$/, 'Identifiant d’installation invalide.'),
  state: z.string().trim().min(16, 'Paramètre de sécurité manquant.').optional(),
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

  const store = await cookies()
  const expected = store.get(GITHUB_INSTALL_STATE_COOKIE)?.value
  store.delete({ name: GITHUB_INSTALL_STATE_COOKIE, path: '/api/github' })
  const stateValid = Boolean(expected && parsed.data.state && expected === parsed.data.state)

  // On vérifie auprès de GitHub que l'installation existe bien pour notre App.
  // L'installation doit avoir été créée pendant ce flux (state + created_at) :
  // un identifiant existant ne peut pas être rattaché à un autre compte.
  let installation: Awaited<ReturnType<typeof installationExists>>
  try {
    installation = await installationExists(parsed.data.installationId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'GitHub App indisponible.' },
      { status: 502 },
    )
  }
  if (!installation) {
    return NextResponse.json({ error: 'Installation GitHub introuvable.' }, { status: 404 })
  }
  // Sans state (GitHub ne le renvoie pas toujours), on n'accepte qu'une installation
  // créée à l'instant : impossible de s'approprier un identifiant ancien.
  const maxAgeMs = stateValid ? 30 * 60_000 : 10 * 60_000
  if (!installation.createdAt || Date.now() - installation.createdAt.getTime() > maxAgeMs) {
    return NextResponse.json(
      { error: 'Cette installation GitHub est trop ancienne pour être rattachée. Réinstallez l’application depuis GitHub.' },
      { status: 403 },
    )
  }

  const linked = await prisma.gitInstallation.upsert({
    where: { installationId: parsed.data.installationId },
    create: {
      userId: session.user.id,
      installationId: parsed.data.installationId,
      accountLogin: installation.login,
    },
    update: { userId: session.user.id, accountLogin: installation.login },
  })

  return NextResponse.json({ installation: { id: linked.id, accountLogin: linked.accountLogin } })
}
