import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { getPatSummary, listPatRepositories } from '@/lib/git-credentials'
import { listInstallationRepositories, type GitHubRepoSummary } from '@/lib/github-app'

export const dynamic = 'force-dynamic'

interface RepositoryOption extends GitHubRepoSummary {
  source: 'app' | 'pat'
  installationId?: string
  accountLogin?: string
}

/**
 * Dépôts accessibles via les installations GitHub App du compte connecté, complétés
 * par ceux du jeton personnel (PAT) s'il y en a un. Les doublons privilégient l'App.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const userId = session.user.id

  const [installations, pat] = await Promise.all([
    prisma.gitInstallation.findMany({
      where: { userId },
      select: { installationId: true, accountLogin: true },
    }),
    getPatSummary(userId),
  ])

  const repositories: RepositoryOption[] = []
  const errors: string[] = []
  for (const installation of installations) {
    try {
      const repos = await listInstallationRepositories(installation.installationId)
      for (const repo of repos) {
        repositories.push({
          ...repo,
          source: 'app',
          installationId: installation.installationId,
          accountLogin: installation.accountLogin,
        })
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Liste indisponible.')
    }
  }

  if (pat) {
    try {
      for (const repo of await listPatRepositories(userId)) {
        repositories.push({ ...repo, source: 'pat', accountLogin: pat.login })
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Liste du jeton personnel indisponible.')
    }
  }

  const seen = new Set<string>()
  const unique = repositories
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .filter((repo) => {
      const key = repo.fullName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return NextResponse.json(
    {
      repositories: unique,
      sources: {
        app: installations.length > 0,
        pat: Boolean(pat),
      },
      errors,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
