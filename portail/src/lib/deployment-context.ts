/**
 * Contexte de déploiement d'**une** application (lot C/D2, préparé Lot G).
 *
 * Source de vérité : `ProjectApp` quand disponible. En transition, on conserve
 * un repli sur les miroirs `Project.*` pour les projets/déploiements sans app
 * explicite chargée.
 *
 * Fonction pure, testée sans base/Redis/Coolify (`deployment-context.test.ts`).
 */
import type { BuildPlan } from '@eflex/detector'
import { deploymentSlug, getPrimaryApp } from '@/lib/project-apps'

export interface DeploymentDomain {
  hostname: string
  verifiedAt: Date | null
  appId?: string | null
}

export interface DeploymentAppInput {
  id: string
  name: string
  root: string
  position: number
  plan: unknown
  domain: string | null
}

export interface DeploymentProjectInput {
  slug: string
  /** Miroirs historiques (transition Lot G). */
  plan?: unknown
  domain?: string | null
  domains: DeploymentDomain[]
  /** Applications du projet, si chargées. */
  apps?: DeploymentAppInput[]
}

export interface DeploymentContext {
  /** Plan v1 de l'application déployée. */
  plan: BuildPlan
  /** Application ciblée (`null` uniquement si aucune app résolue, cas legacy). */
  appId: string | null
  /** Nom Coolify / préfixe des labels (`slug` ou `slug-app`). */
  deployKey: string
  /** Domaine principal de l'application (`null` = application non exposée). */
  domain: string | null
  /** Hôtes à attacher au conteneur (principal + alias vérifiés). */
  hosts: string[]
  /** Vrai pour l'application principale : traitements spécifiques conservés. */
  primary: boolean
}

/** Un `BuildPlan` minimal exploitable par le worker. */
export function isBuildPlan(value: unknown): value is BuildPlan {
  return typeof value === 'object' && value !== null && 'framework' in value && 'port' in value
}

export const INVALID_PLAN_MESSAGE =
  "Plan de build absent ou invalide : relancez la création du projet."

function hostsFor(
  domain: string | null,
  domains: DeploymentDomain[],
  appId: string | null,
  primary: boolean,
): string[] {
  const custom = domains
    .filter((item) => item.verifiedAt !== null)
    .filter((item) => {
      if (appId === null) return true
      if (item.appId === appId) return true
      return primary && (item.appId === null || item.appId === undefined)
    })
    .map((item) => item.hostname)

  return [...new Set([domain, ...custom].filter((host): host is string => Boolean(host)))]
}

function contextFromApp(
  project: DeploymentProjectInput,
  app: DeploymentAppInput,
): { context: DeploymentContext } | { error: string } {
  if (!isBuildPlan(app.plan)) return { error: INVALID_PLAN_MESSAGE }
  const primary = app.position === 0
  const hosts = hostsFor(app.domain, project.domains, app.id, primary)
  return {
    context: {
      plan: app.plan,
      appId: app.id,
      deployKey: primary ? project.slug : deploymentSlug(project.slug, app.name),
      domain: app.domain ?? hosts[0] ?? null,
      hosts,
      primary,
    },
  }
}

export function resolveDeploymentContext(input: {
  project: DeploymentProjectInput
  app: DeploymentAppInput | null
}): { context: DeploymentContext } | { error: string } {
  const { project, app } = input
  if (app) return contextFromApp(project, app)

  // Déploiement sans app explicite : préférer l'app principale si connue.
  const primaryApp = getPrimaryApp(project.apps ?? [])
  if (primaryApp) return contextFromApp(project, primaryApp)

  // Repli historique (transition Lot G) : miroirs Project.*.
  if (!isBuildPlan(project.plan)) return { error: INVALID_PLAN_MESSAGE }
  const hosts = hostsFor(project.domain ?? null, project.domains, null, true)
  return {
    context: {
      plan: project.plan,
      appId: null,
      deployKey: project.slug,
      domain: (project.domain ?? hosts[0]) ?? null,
      hosts,
      primary: true,
    },
  }
}
