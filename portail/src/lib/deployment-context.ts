/**
 * Contexte de déploiement d'**une** application (lot C de D2).
 *
 * Le worker traite un job = un `Deployment`. Quand `Deployment.appId` est
 * renseigné, le plan, le dossier, le domaine et le nom Coolify viennent de la
 * ligne `ProjectApp` ; sinon, ils viennent des colonnes `Project.*` (chemin
 * mono-application historique, inchangé).
 *
 * Cette résolution est une fonction pure : elle est testée sans base, sans
 * Redis et sans Coolify (voir `deployment-context.test.ts`).
 */
import type { BuildPlan } from '@eflex/detector'
import { deploymentSlug } from '@/lib/project-apps'

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
  plan: unknown
  domain: string | null
  domains: DeploymentDomain[]
}

export interface DeploymentContext {
  /** Plan v1 de l'application déployée. */
  plan: BuildPlan
  /** Application ciblée (`null` = déploiement historique de portée projet). */
  appId: string | null
  /** Nom Coolify / préfixe des labels (`slug` ou `slug-app`). */
  deployKey: string
  /** Domaine principal de l'application (`null` = application non exposée). */
  domain: string | null
  /** Hôtes à attacher au conteneur (principal + alias vérifiés). */
  hosts: string[]
  /** Vrai pour l'application principale : le miroir `Project.*` est maintenu. */
  primary: boolean
}

/** Un `BuildPlan` minimal exploitable par le worker. */
export function isBuildPlan(value: unknown): value is BuildPlan {
  return typeof value === 'object' && value !== null && 'framework' in value && 'port' in value
}

export const INVALID_PLAN_MESSAGE =
  "Plan de build absent ou invalide : relancez la création du projet."

/**
 * Hôtes d'une application :
 * - application implicite (`app = null`) : domaine du projet + **tous** les
 *   alias vérifiés (comportement historique) ;
 * - application nommée : son domaine + les alias qui lui sont rattachés ;
 *   l'application principale reçoit en plus les alias historiques de portée
 *   projet (`appId = null`), pour ne rien casser après le backfill.
 */
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

export function resolveDeploymentContext(input: {
  project: DeploymentProjectInput
  app: DeploymentAppInput | null
}): { context: DeploymentContext } | { error: string } {
  const { project, app } = input
  if (app) {
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

  if (!isBuildPlan(project.plan)) return { error: INVALID_PLAN_MESSAGE }
  const hosts = hostsFor(project.domain, project.domains, null, true)
  return {
    context: {
      plan: project.plan,
      appId: null,
      deployKey: project.slug,
      domain: project.domain ?? hosts[0] ?? null,
      hosts,
      primary: true,
    },
  }
}
