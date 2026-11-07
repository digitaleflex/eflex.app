import { z } from 'zod'
import { isValidBranch, parseGitHubUrl, type GitHubRepoRef } from '@/lib/github-url'
import { AnalysisError } from '@/lib/repo-analysis'

const ROOT_RE = /^[A-Za-z0-9._/-]{1,200}$/

/** Champs communs à « analyser » et « créer le projet ». */
export const repoFields = {
  repoUrl: z.string().trim().min(1, "Indiquez l'adresse du dépôt GitHub.").max(300),
  branch: z.string().trim().max(200).optional(),
  /** Application choisie dans un monorepo (dossier relatif à la racine du dépôt). */
  root: z.string().trim().max(200).optional(),
}

export type RepoFields = {
  repoUrl: string
  branch?: string | undefined
  root?: string | undefined
}

/** Valide l'URL, la branche et le dossier ; lève une AnalysisError 400 sinon. */
export function resolveRepo(input: RepoFields): { ref: GitHubRepoRef; root: string } {
  const parsed = parseGitHubUrl(input.repoUrl)
  if (!parsed) {
    throw new AnalysisError(
      "Adresse GitHub invalide. Exemple : https://github.com/votre-compte/votre-depot",
      400,
    )
  }

  const branch = input.branch || parsed.branch
  if (branch && !isValidBranch(branch)) throw new AnalysisError('Nom de branche invalide.', 400)

  const root = (input.root ?? '').replace(/^\/+|\/+$/g, '')
  if (root !== '' && (!ROOT_RE.test(root) || root.split('/').some((s) => s === '..' || s === '.' || s === ''))) {
    throw new AnalysisError("Dossier de l'application invalide.", 400)
  }

  return { ref: { owner: parsed.owner, repo: parsed.repo, branch: branch || null }, root }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AnalysisError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('[analyse] erreur inattendue', error)
  return Response.json({ error: "L'analyse a échoué. Réessayez dans un instant." }, { status: 500 })
}
