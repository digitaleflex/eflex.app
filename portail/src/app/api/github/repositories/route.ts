import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { listInstallationRepositories } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

/** Dépôts accessibles via les installations GitHub App du compte connecté. */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const installations = await prisma.gitInstallation.findMany({
    where: { userId: session.user.id },
    select: { installationId: true, accountLogin: true },
  })

  const repositories = []
  const errors: string[] = []
  for (const installation of installations) {
    try {
      const repos = await listInstallationRepositories(installation.installationId)
      for (const repo of repos) {
        repositories.push({ ...repo, installationId: installation.installationId, accountLogin: installation.accountLogin })
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Liste indisponible.')
    }
  }

  return NextResponse.json(
    { repositories, errors },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
