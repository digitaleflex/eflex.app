import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getPatSummary } from '@/lib/git-credentials'
import { getAppConfig, getOAuthConfig, installationUrl } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

/** Méthodes de connexion GitHub de l'utilisateur (App recommandée, PAT en repli). */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const [config, installations, pat] = await Promise.all([
    getAppConfig(),
    prisma.gitInstallation.findMany({
      where: { userId: session.user.id },
      select: { installationId: true, accountLogin: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    getPatSummary(session.user.id),
  ])

  return NextResponse.json(
    {
      app: {
        configured: Boolean(config),
        oauthConfigured: Boolean(await getOAuthConfig()),
        slug: config?.slug ?? null,
        installationUrl: await installationUrl(),
      },
      installations: installations.map((installation) => ({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
      })),
      pat: pat ? { login: pat.login, scopes: pat.scopes, updatedAt: pat.updatedAt.toISOString() } : null,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
