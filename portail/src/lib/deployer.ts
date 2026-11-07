// Provisionnement d'un projet sur Coolify : applications, variables, déploiement.
// Tout ou rien : si une étape échoue, les applications déjà créées sont supprimées pour ne
// laisser aucune application orpheline côté Coolify.

import type { BuildPlan } from '@eflex/detector'
import { CoolifyClient, CoolifyError, mapDeploymentStatus, tailLogs } from '@/lib/coolify'
import { mergeEnv, planToCoolify, type CoolifyEnvVar } from '@/lib/coolify-plan'

export interface DeployInput {
  plan: BuildPlan
  /** Slug du projet : nom de l'application et sous-domaine. */
  slug: string
  repoUrl: string
  branch: string
  /** Variables saisies par l'utilisateur (elles l'emportent sur celles du plan). */
  env: CoolifyEnvVar[]
}

export interface DeployResult {
  /** Application web. */
  appId: string
  /** Applications des services annexes, par nom de service. */
  workers: Record<string, string>
  /** Déploiement de l'application web. */
  deploymentUuid: string
  /** Nom d'hôte public attribué, s'il y en a un. */
  domain?: string
  warnings: string[]
}

export class DeployError extends Error {
  constructor(
    message: string,
    /** Applications Coolify qu'il n'a pas été possible de supprimer. */
    readonly leftovers: string[] = [],
  ) {
    super(message)
    this.name = 'DeployError'
  }
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'Erreur inconnue avec Coolify')

export async function provisionAndDeploy(client: CoolifyClient, input: DeployInput): Promise<DeployResult> {
  const domain = client.domainFor(input.slug)
  const { apps, env: planEnv, warnings } = planToCoolify(input.plan, {
    name: input.slug,
    repoUrl: input.repoUrl,
    branch: input.branch,
    domain,
  })
  const env = mergeEnv(planEnv, input.env)

  const created: string[] = []
  const ids: Record<string, string> = {}

  try {
    for (const app of apps) {
      const { uuid } = await client.createApplication(app.payload)
      created.push(uuid)
      ids[app.role] = uuid

      // Les variables doivent exister avant le premier build.
      for (const variable of env) {
        try {
          await client.setEnv(uuid, variable)
        } catch (error) {
          throw new CoolifyError(`Variable « ${variable.key} » non transmise : ${messageOf(error)}`)
        }
      }
    }

    const web = await client.deploy(ids.web as string)
    for (const app of apps) {
      if (app.role !== 'web') await client.deploy(ids[app.role] as string)
    }

    const { web: appId, ...workers } = ids
    return {
      appId: appId as string,
      workers,
      deploymentUuid: web.deploymentUuid,
      ...(domain ? { domain } : {}),
      warnings,
    }
  } catch (error) {
    const leftovers: string[] = []
    for (const uuid of [...created].reverse()) {
      try {
        await client.deleteApplication(uuid)
      } catch {
        leftovers.push(uuid)
      }
    }
    const cleanup =
      leftovers.length > 0
        ? ` Nettoyage incomplet : supprimez à la main ${leftovers.length > 1 ? 'les applications' : "l'application"} Coolify ${leftovers.join(', ')}.`
        : ''
    throw new DeployError(`${messageOf(error)}${cleanup}`, leftovers)
  }
}

export interface DeploymentToSync {
  status: string
  coolifyBuildId: string | null
}

export interface DeploymentPatch {
  status: string
  commitSha?: string
  logsSummary?: string
}

const IN_PROGRESS = new Set(['pending', 'building', 'deploying'])
const COMMIT_RE = /^[0-9a-f]{7,40}$/

/**
 * Interroge Coolify pour un déploiement en cours et retourne ce qu'il faut enregistrer,
 * ou null s'il n'y a rien à changer (déjà terminé, ou Coolify momentanément injoignable :
 * on garde le statut précédent plutôt que d'inventer un échec).
 */
export async function syncDeployment(client: CoolifyClient, deployment: DeploymentToSync): Promise<DeploymentPatch | null> {
  if (!deployment.coolifyBuildId || !IN_PROGRESS.has(deployment.status)) return null

  let remote
  try {
    remote = await client.getDeployment(deployment.coolifyBuildId)
  } catch {
    return null
  }

  const status = mapDeploymentStatus(remote.status)
  const patch: DeploymentPatch = { status }
  if (remote.commit && COMMIT_RE.test(remote.commit)) patch.commitSha = remote.commit
  if (status === 'failed') {
    patch.logsSummary = tailLogs(remote.logs) || 'Le déploiement a échoué (journaux indisponibles).'
  }
  return patch.status === deployment.status && !patch.commitSha && !patch.logsSummary ? null : patch
}
