// BuildPlan (détecteur) → applications Coolify. Fonction pure, sans réseau : elle décide ce
// qui est envoyé à Coolify, et les tests vérifient chaque charge utile contre le schéma
// officiel de l'API (test-support/coolify-api-schemas.json).
//
// Le plan pilote la configuration (commandes, port, dossier, dossier publié, santé,
// commandes post-déploiement) ; le moteur de build reste celui de Coolify :
//   - runtime docker@*  → build pack « dockerfile » (le Dockerfile du dépôt fait foi)
//   - runtime static@*  → build pack « static » (nginx sert le dossier publié)
//   - le reste          → build pack « nixpacks », avec les commandes du plan
// Les services supplémentaires du plan (queue, scheduler…) deviennent des applications
// « worker » du même dépôt, avec leur propre commande de démarrage.

import type { BuildPlan } from '@eflex/detector'

export interface AppContext {
  /** Nom de base des applications Coolify (le slug du projet). */
  name: string
  repoUrl: string
  branch: string
  /** Nom d'hôte public de l'application web, sans protocole (facultatif). */
  domain?: string | undefined
}

export interface CoolifyAppSpec {
  /** `web` pour l'application exposée ; sinon le nom du service du plan (queue, scheduler…). */
  role: string
  /** Corps de `POST /applications/public`, sans l'emplacement (projet, serveur, environnement). */
  payload: Record<string, unknown>
}

export interface CoolifyEnvVar {
  key: string
  value: string
}

export interface CoolifyPlan {
  apps: CoolifyAppSpec[]
  /** Variables déduites du plan (buildEnv, buildArgs) : publiques, à fusionner avec celles de l'utilisateur. */
  env: CoolifyEnvVar[]
  /** Limites connues du déploiement obtenu, à montrer à l'utilisateur. */
  warnings: string[]
}

/** Services qui font tourner l'application web elle-même : un seul conteneur Coolify. */
const WEB_SERVICES = new Set(['app', 'web'])

const withSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`)

type Kind = 'docker' | 'static' | 'nixpacks'

function kindOf(plan: BuildPlan): Kind {
  if (plan.runtime.startsWith('docker@') || plan.framework === 'docker') return 'docker'
  if (plan.runtime.startsWith('static@')) return 'static'
  return 'nixpacks'
}

export function planToCoolify(plan: BuildPlan, ctx: AppContext): CoolifyPlan {
  const kind = kindOf(plan)
  const warnings: string[] = []

  const common: Record<string, unknown> = {
    git_repository: ctx.repoUrl,
    git_branch: ctx.branch,
    ports_exposes: String(kind === 'static' ? 80 : plan.port),
  }
  if (plan.root !== '') common.base_directory = withSlash(plan.root)
  if (plan.resources?.cpu !== undefined) common.limits_cpus = String(plan.resources.cpu)
  if (plan.resources?.memoryMb !== undefined) common.limits_memory = `${plan.resources.memoryMb}m`

  const web: Record<string, unknown> = { ...common, name: ctx.name }
  if (ctx.domain) web.domains = `https://${ctx.domain}`
  // La santé n'est activée que si elle est déclarée : une sonde sur « / » ferait échouer
  // le déploiement d'une API qui répond 404 à cet endroit.
  if (plan.healthcheck) {
    web.health_check_enabled = true
    web.health_check_path = plan.healthcheck
  }
  if (plan.postDeploy && plan.postDeploy.length > 0) {
    web.post_deployment_command = plan.postDeploy.join(' && ')
  }

  if (kind === 'docker') {
    web.build_pack = 'dockerfile'
    web.dockerfile_location = withSlash(plan.dockerfile ?? 'Dockerfile')
  } else if (kind === 'static') {
    web.build_pack = 'static'
    web.is_static = true
    web.static_image = 'nginx:alpine'
    web.publish_directory = withSlash(plan.publish ?? '')
    if (plan.install) web.install_command = plan.install
    if (plan.build) web.build_command = plan.build
  } else {
    web.build_pack = 'nixpacks'
    if (plan.install) web.install_command = plan.install
    if (plan.build) web.build_command = plan.build
    if (plan.start) web.start_command = plan.start
  }

  const apps: CoolifyAppSpec[] = [{ role: 'web', payload: web }]

  // Services supplémentaires : une application Coolify chacun, même dépôt et mêmes commandes
  // de build, sans domaine ni sonde, avec leur propre commande de démarrage.
  const extra = Object.entries(plan.services ?? {}).filter(([name]) => !WEB_SERVICES.has(name))
  if (extra.length > 0 && kind !== 'nixpacks') {
    warnings.push(
      `Services supplémentaires non déployés (${extra.map(([name]) => name).join(', ')}) : seul un déploiement Nixpacks les prend en charge pour l'instant.`,
    )
  } else {
    for (const [name, spec] of extra) {
      const worker: Record<string, unknown> = { ...common, name: `${ctx.name}-${name}`, build_pack: 'nixpacks' }
      if (plan.install) worker.install_command = plan.install
      if (plan.build) worker.build_command = plan.build
      worker.start_command = spec.command
      apps.push({ role: name, payload: worker })
      if ((spec.replicas ?? 1) > 1) {
        warnings.push(`Le service « ${name} » demande ${spec.replicas} réplicas : un seul est lancé pour l'instant.`)
      }
    }
  }

  if (plan.volumes && plan.volumes.length > 0) {
    warnings.push(
      `Volumes non montés (${plan.volumes.join(', ')}) : les fichiers écrits dans ces dossiers sont perdus à chaque déploiement.`,
    )
  }
  if (plan.root !== '') {
    warnings.push(
      `Application située dans « ${plan.root} » : les commandes sont lancées depuis ce dossier, ce qui ne suffit pas si elle dépend d'autres paquets du monorepo.`,
    )
  }

  // buildEnv et buildArgs sont des valeurs publiques gravées au build ; Coolify les transmet
  // comme variables (et comme arguments de build pour un Dockerfile).
  const env = Object.entries({ ...(plan.buildEnv ?? {}), ...(plan.buildArgs ?? {}) }).map(([key, value]) => ({ key, value }))

  return { apps, env, warnings }
}

/** Variables du plan + celles de l'utilisateur ; l'utilisateur l'emporte à clé égale. */
export function mergeEnv(fromPlan: CoolifyEnvVar[], fromUser: CoolifyEnvVar[]): CoolifyEnvVar[] {
  const merged = new Map<string, string>()
  for (const { key, value } of fromPlan) merged.set(key, value)
  for (const { key, value } of fromUser) merged.set(key, value)
  return [...merged].map(([key, value]) => ({ key, value }))
}
