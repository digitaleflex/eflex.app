import { diagnoseFailure, type Diagnosis } from '@/lib/deployment-diagnosis'

/**
 * Données d'un déploiement transmises au composant client `DeploymentItem`.
 *
 * Le journal brut (`logsSummary`) n'en fait jamais partie : il est stocké sans masquage
 * et tout ce qui est passé à un composant client part dans la charge utile envoyée au
 * navigateur. Le diagnostic est donc calculé ici, côté serveur, et seul son résultat
 * (cause + action, chaînes fixes) est transmis. Les journaux lisibles passent par la
 * route dédiée, qui masque les secrets.
 */
export type DeploymentItemData = {
  id: string
  status: string
  commitSha: string
  createdAt: Date
  app: { id: string; name: string } | null
  diagnosis: Diagnosis | null
}

export type DeploymentWithLogs = {
  id: string
  status: string
  commitSha: string
  createdAt: Date
  logsSummary: string | null
  app: { id: string; name: string } | null
}

/** Champs choisis un par un (jamais d'étalement) : aucun champ ajouté au `select` ne fuit. */
export function toDeploymentItemData(deployment: DeploymentWithLogs, projectId: string): DeploymentItemData {
  return {
    id: deployment.id,
    status: deployment.status,
    commitSha: deployment.commitSha,
    createdAt: deployment.createdAt,
    app: deployment.app ? { id: deployment.app.id, name: deployment.app.name } : null,
    diagnosis:
      deployment.status === 'failed'
        ? diagnoseFailure({ status: deployment.status, logs: deployment.logsSummary, projectId })
        : null,
  }
}
