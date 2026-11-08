/**
 * Pont entre le BuildPlan stocké en base et les artefacts envoyés à Coolify.
 * Le plan (et lui seul) décide du port, des services et des commandes.
 */
import type { BuildPlan } from '@eflex/detector'
import { buildDeploymentArtifacts, type DeploymentArtifacts } from '@eflex/renderer'

export function buildProjectArtifacts(
  plan: BuildPlan,
  projectId: string,
  domain?: string,
): DeploymentArtifacts {
  return buildDeploymentArtifacts(plan, {
    projectId,
    domain,
    image: `eflex/${projectId}:latest`,
  })
}
