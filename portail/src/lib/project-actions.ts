/**
 * Situation d'un projet et action prioritaire à proposer.
 *
 * Un seul endroit décide de l'action mise en avant selon le dernier
 * déploiement et les permissions : la page projet et ses bandeaux restent
 * cohérents, et les tests couvrent chaque cas.
 */
import { statusInfo } from '@/lib/project-status'

export type ProjectSituation = 'failed' | 'in-progress' | 'live' | 'never' | 'idle'

export type NextActionKind = 'deploy' | 'redeploy' | 'logs' | 'follow' | 'visit' | 'settings'

export type NextProjectAction = {
  kind: NextActionKind
  label: string
  /** Lien interne ou externe ; absent pour les actions déclenchées par un bouton. */
  href?: string
  /** `true` pour un site public ouvert dans un nouvel onglet. */
  external?: boolean
}

/** Classe le projet à partir de son dernier déploiement. */
export function projectSituation(lastStatus: string | null | undefined, hasDeployments: boolean): ProjectSituation {
  if (!hasDeployments || !lastStatus) return 'never'
  const info = statusInfo(lastStatus)
  if (info.tone === 'danger') return 'failed'
  if (info.inProgress) return 'in-progress'
  if (lastStatus === 'live') return 'live'
  return 'idle'
}

/**
 * Action prioritaire :
 * - échec → lire les journaux avant de relancer ;
 * - déploiement en cours → suivre ;
 * - jamais déployé → lancer (si le rôle le permet) ;
 * - en ligne avec domaine → ouvrir le site ;
 * - en ligne sans domaine ou annulé → redéployer (si le rôle le permet).
 */
export function nextProjectAction(input: {
  projectId: string
  situation: ProjectSituation
  domain: string | null
  canManage: boolean
}): NextProjectAction | null {
  const deploymentsHref = `/dashboard/projects/${input.projectId}?tab=deployments`
  switch (input.situation) {
    case 'failed':
      return { kind: 'logs', label: 'Voir les journaux', href: deploymentsHref }
    case 'in-progress':
      return { kind: 'follow', label: 'Suivre le déploiement', href: deploymentsHref }
    case 'never':
      return input.canManage ? { kind: 'deploy', label: 'Lancer le déploiement' } : null
    case 'live':
      if (input.domain) return { kind: 'visit', label: 'Ouvrir le site', href: `https://${input.domain}`, external: true }
      return input.canManage ? { kind: 'redeploy', label: 'Redéployer' } : null
    case 'idle':
      return input.canManage
        ? { kind: 'redeploy', label: 'Redéployer' }
        : { kind: 'logs', label: 'Voir les journaux', href: deploymentsHref }
  }
}
