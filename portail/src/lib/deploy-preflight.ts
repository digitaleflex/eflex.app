import { dockerImageFromRepoUrl } from '@/lib/docker-image-ref'
import { isValidBranch, parseGitHubUrl } from '@/lib/github-url'

/**
 * Pré-vérifications avant déploiement (issue #164) : fonctions pures, sans réseau, messages en français avec une action.
 * - `blocking` : le déploiement échouerait à coup sûr (on s'arrête avant de consommer une file ou un build).
 * - `warning` : le déploiement peut réussir mais l'application risque de ne pas fonctionner (affiché, jamais bloquant).
 * Rien ici ne vérifie l'accès réel au dépôt (réseau) : le diagnostic des journaux reste la source pour ces cas.
 */
export interface PreflightIssue {
  code: string
  level: 'blocking' | 'warning'
  message: string
  action: string
}

export interface PreflightInput {
  repoUrl: string
  branch: string
  framework: string
  /** Noms des variables d'environnement définies (jamais leurs valeurs). */
  envKeys: string[]
}

export function preflightChecks(input: PreflightInput): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const isImage = dockerImageFromRepoUrl(input.repoUrl) !== null

  if (!isImage) {
    if (!parseGitHubUrl(input.repoUrl)) {
      issues.push({
        code: 'repo-url',
        level: 'blocking',
        message: 'L’adresse du dépôt n’est pas reconnue comme un dépôt GitHub.',
        action: 'Corrigez l’adresse du dépôt dans Réglages > Branche et déploiement (sources prises en charge : GitHub et images Docker).',
      })
    }
    if (!isValidBranch(input.branch)) {
      issues.push({
        code: 'branch',
        level: 'blocking',
        message: `Le nom de branche « ${input.branch.slice(0, 60)} » n’est pas valide.`,
        action: 'Choisissez une branche existante dans Réglages > Branche et déploiement.',
      })
    }
  }

  const keys = new Set(input.envKeys)
  if (input.framework === 'laravel' && !keys.has('APP_KEY')) {
    issues.push({
      code: 'laravel-app-key',
      level: 'warning',
      message: 'Laravel : la variable APP_KEY n’est pas définie.',
      action: 'Ajoutez APP_KEY (générée par `php artisan key:generate --show`) dans les variables ; sans elle, l’application répondra par une erreur 500.',
    })
  }
  return issues
}

export function blockingIssues(issues: PreflightIssue[]): PreflightIssue[] {
  return issues.filter((issue) => issue.level === 'blocking')
}
