import { decrypt, encrypt } from '@/lib/crypto'
import { AnalysisError } from '@/lib/repo-analysis'
import {
  fetchUserForToken,
  getInstallationToken,
  listUserRepositories,
  type GitHubRepoSummary,
} from '@/lib/github-app'
import { prisma } from '@/lib/prisma'

/** AAD du jeton personnel : un jeton chiffré ne peut pas être déplacé vers un autre compte. */
const patAad = (userId: string) => `github-pat:${userId}`

export interface ResolvedRepoToken {
  token: string
  source: 'app' | 'pat'
}

export interface PatSummary {
  login: string
  scopes: string[]
  updatedAt: Date
}

function parseScopes(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
}

/**
 * Jeton à utiliser pour un dépôt : installation GitHub App (recommandé) ou PAT
 * personnel. L'installation doit appartenir à l'utilisateur connecté.
 */
export async function resolveUserRepoToken(
  userId: string,
  input: { installationId?: string | undefined; usePat?: boolean | undefined },
): Promise<ResolvedRepoToken | null> {
  if (input.installationId) {
    const installation = await prisma.gitInstallation.findFirst({
      where: { userId, installationId: input.installationId },
      select: { installationId: true },
    })
    if (!installation) {
      throw new AnalysisError('Cette installation GitHub n’est pas liée à votre compte.', 403)
    }
    try {
      return { token: await getInstallationToken(installation.installationId), source: 'app' }
    } catch {
      throw new AnalysisError('Impossible d’obtenir l’accès GitHub. Réessayez dans un instant.', 502)
    }
  }

  if (input.usePat) {
    const pat = await readPat(userId)
    if (!pat) {
      throw new AnalysisError(
        'Aucun jeton GitHub personnel enregistré. Ajoutez-en un dans Paramètres → Connexion GitHub.',
        403,
      )
    }
    return pat
  }

  return null
}

async function readPat(userId: string): Promise<ResolvedRepoToken | null> {
  const pat = await prisma.gitPat.findUnique({
    where: { userId },
    select: { token: true },
  })
  if (!pat) return null
  try {
    return { token: decrypt(pat.token, patAad(userId)), source: 'pat' }
  } catch {
    throw new AnalysisError('Le jeton GitHub enregistré est illisible. Enregistrez-le à nouveau.', 500)
  }
}

/** Jeton du propriétaire d'un projet, pour les redéploiements et les deploy keys. */
export async function resolveProjectToken(project: {
  userId: string
  installationId: string | null
}): Promise<string | null> {
  if (project.installationId) {
    try {
      return await getInstallationToken(project.installationId)
    } catch {
      return null
    }
  }
  const pat = await prisma.gitPat.findUnique({
    where: { userId: project.userId },
    select: { token: true },
  })
  if (!pat) return null
  try {
    return decrypt(pat.token, patAad(project.userId))
  } catch {
    return null
  }
}

export async function getPatSummary(userId: string): Promise<PatSummary | null> {
  const pat = await prisma.gitPat.findUnique({
    where: { userId },
    select: { login: true, scopes: true, updatedAt: true },
  })
  if (!pat) return null
  return { login: pat.login, scopes: parseScopes(pat.scopes), updatedAt: pat.updatedAt }
}

/** Valide le jeton auprès de GitHub puis l'enregistre chiffré (un seul PAT par compte). */
export async function savePat(userId: string, token: string): Promise<PatSummary> {
  const clean = token.trim()
  if (clean.length < 20 || clean.length > 500) {
    throw new AnalysisError('Jeton GitHub invalide (longueur inattendue).', 400)
  }
  let identity: { login: string; scopes: string | null }
  try {
    identity = await fetchUserForToken(clean)
  } catch (error) {
    throw new AnalysisError(error instanceof Error ? error.message : 'Jeton GitHub invalide.', 400)
  }
  const pat = await prisma.gitPat.upsert({
    where: { userId },
    create: {
      userId,
      login: identity.login,
      token: encrypt(clean, patAad(userId)),
      scopes: identity.scopes,
    },
    update: {
      login: identity.login,
      token: encrypt(clean, patAad(userId)),
      scopes: identity.scopes,
    },
    select: { login: true, scopes: true, updatedAt: true },
  })
  return { login: pat.login, scopes: parseScopes(pat.scopes), updatedAt: pat.updatedAt }
}

export async function deletePat(userId: string): Promise<void> {
  await prisma.gitPat.deleteMany({ where: { userId } })
}

/** Dépôts accessibles au PAT de l'utilisateur (vide s'il n'en a pas). */
export async function listPatRepositories(userId: string): Promise<GitHubRepoSummary[]> {
  const pat = await prisma.gitPat.findUnique({ where: { userId }, select: { token: true } })
  if (!pat) return []
  return listUserRepositories(decrypt(pat.token, patAad(userId)))
}
