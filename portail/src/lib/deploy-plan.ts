/**
 * Pont entre le BuildPlan stocké en base et les artefacts envoyés à Coolify.
 * Le plan (et lui seul) décide du port, des services et des commandes.
 *
 * Note : Coolify 4.6 ne sait pas combiner un Dockerfile/compose généré avec le
 * source d'un dépôt (le champ `dockerfile` ne clone pas le dépôt, et le compose
 * brut relit le fichier du dépôt). Le portail déploie donc :
 *   - les dépôts qui ont leur propre Dockerfile (`build_pack=dockerfile`) ;
 *   - les frameworks sans Dockerfile via Nixpacks, avec les commandes du plan.
 */
import type { BuildPlan } from '@eflex/detector'
import {
  buildDeploymentArtifacts,
  traefikLabels,
  type DeploymentArtifacts,
} from '@eflex/renderer'

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

/** Normalise un domaine en nom d'hôte (sans schéma ni chemin). */
export function normalizeHost(domain: string): string {
  return domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
}

/**
 * Labels Traefik pour le Traefik existant. Coolify tourne avec un proxy `none`
 * et `generate_exact_labels=true` : les labels doivent venir de l'application.
 */
export function buildApplicationLabels(
  projectId: string,
  domain: string,
  port: number,
): string[] {
  return traefikLabels(projectId, 'app', normalizeHost(domain), port, 'proxy')
}

const STATIC_FRAMEWORKS = new Set(['static', 'vite', 'svelte', 'astro'])

/**
 * Répertoire publié pour un site statique avec Nixpacks. Le renderer utilise
 * `dist` quand un build est défini, sinon la racine du dépôt.
 */
export function publishDirectoryForPlan(plan: BuildPlan): string | undefined {
  if (!STATIC_FRAMEWORKS.has(plan.framework)) return undefined
  return plan.build ? 'dist' : '.'
}

/**
 * Variable d'environnement de build qui force la version du runtime Nixpacks
 * (le plan la connaît déjà : `node@22`, `python@3.12`, `php@8.3`).
 */
export function nixpacksRuntimeVariable(
  runtime: string,
): { key: string; value: string } | null {
  const at = runtime.indexOf('@')
  if (at === -1) return null
  const name = runtime.slice(0, at)
  const version = runtime.slice(at + 1).trim()
  if (!version) return null

  if (name === 'node') return { key: 'NIXPACKS_NODE_VERSION', value: version }
  if (name === 'python') return { key: 'NIXPACKS_PYTHON_VERSION', value: version }
  if (name === 'php') return { key: 'NIXPACKS_PHP_VERSION', value: version }
  return null
}
