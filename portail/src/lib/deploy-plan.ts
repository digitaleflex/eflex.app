/**
 * Pont entre le BuildPlan stocké en base et les artefacts envoyés à Coolify.
 * Le plan (et lui seul) décide du port, des services et des commandes.
 *
 * Note : Coolify 4.7.3 ne sait pas combiner un Dockerfile/compose généré avec
 * le source d'un dépôt (le champ `dockerfile` ne clone pas le dépôt, et le
 * compose brut relit le fichier du dépôt à chaque déploiement). Le portail
 * déploie donc :
 *   - les dépôts qui fournissent leur propre compose (`framework: compose`,
 *     `build_pack=dockercompose`) : le fichier fait foi, rien n'est généré ;
 *   - les dépôts qui ont leur propre Dockerfile (`build_pack=dockerfile`) ;
 *   - les frameworks sans Dockerfile via Nixpacks, avec les commandes du plan.
 */
import type { BuildPlan } from '@eflex/detector'
import {
  buildDeploymentArtifacts,
  repositoryComposeForPlan,
  traefikLabels,
  type DeploymentArtifacts,
  type RepositoryCompose,
} from '@eflex/renderer'

const STATIC_FRAMEWORKS = new Set(['static', 'vite', 'svelte', 'astro'])

/** Chemin relatif de l'application, sans slash initial ni final. */
function appRoot(plan: BuildPlan): string {
  return (plan.root ?? '').trim().replace(/^\/+|\/+$/g, '')
}

/** Échappe une valeur pour un shell POSIX (chemins et noms de paquets). */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Exécute une commande depuis le dossier de l'application. */
function inApplication(plan: BuildPlan, command: string): string {
  const root = appRoot(plan)
  if (root === '') return command
  return `cd ${shellQuote(root)} && ${command}`
}

/**
 * Réglages d'application Coolify dérivés du plan.
 *
 * Coolify exécute toutes les commandes Nixpacks dans
 * `clone + base_directory`. Un monorepo de workspace doit donc être construit
 * depuis la racine du dépôt (lockfile, paquets voisins), puis démarré depuis le
 * dossier de l'application. À l'inverse, un sous-dossier autonome (hors
 * workspace) garde `base_directory` sur son propre dossier.
 */
export interface CoolifyApplicationSettings {
  /** Répertoire de travail réel (toujours absolu). */
  baseDirectory: string
  /** `true` quand `baseDirectory` vaut la valeur par défaut `/`. */
  baseDirectoryIsDefault: boolean
  installCommand?: string
  buildCommand?: string
  startCommand?: string
  publishDirectory?: string
  /** Chemin du Dockerfile relatif à `baseDirectory` (framework `docker`). */
  dockerfileLocation?: string
  /**
   * Chemin du compose relatif à `baseDirectory` (framework `compose`), avec un
   * `/` initial. Coolify cherche `base_directory + docker_compose_location`.
   */
  dockerComposeLocation?: string
}

export function coolifyApplicationSettings(plan: BuildPlan): CoolifyApplicationSettings {
  const root = appRoot(plan)
  // Le contexte Docker et le compose font exception : le Dockerfile, le contexte
  // de build et le compose sont pensés par l'auteur du dépôt relativement au
  // dossier de l'application. Un workspace JS ne s'applique pas ici.
  const workspace =
    plan.framework === 'docker' || plan.framework === 'compose' ? undefined : plan.workspace
  const baseDirectory = workspace || root === '' ? '/' : `/${root}`

  const installCommand = plan.install
  let buildCommand = plan.build
  let startCommand = plan.start

  if (workspace && root !== '') {
    // `pnpm install` depuis la racine installe tout le workspace (lockfile inclus).
    // Le filtre construit le paquet et ses dépendances internes, dans l'ordre.
    if (
      buildCommand &&
      workspace.manager === 'pnpm' &&
      workspace.name &&
      workspace.buildScript
    ) {
      buildCommand = `pnpm --filter ${shellQuote(workspace.name)}... run ${shellQuote(workspace.buildScript)}`
    } else if (buildCommand) {
      buildCommand = inApplication(plan, buildCommand)
    }
    if (startCommand) startCommand = inApplication(plan, startCommand)
  }

  const dockerfileLocation =
    plan.framework === 'docker' && plan.dockerfile ? `/${plan.dockerfile}` : undefined

  return {
    baseDirectory,
    baseDirectoryIsDefault: baseDirectory === '/',
    installCommand,
    buildCommand,
    startCommand,
    publishDirectory: publishDirectoryForPlan(plan),
    dockerfileLocation,
    dockerComposeLocation:
      plan.framework === 'compose' && plan.compose ? normalizeComposeLocation(plan.compose.location) : undefined,
  }
}

/** Chemin compose normalisé (`/` initial, pas de `..`, pas de dossier vide). */
export function normalizeComposeLocation(location: string): string {
  const parts = location
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.')
  if (parts.some((part) => part === '..')) return '/docker-compose.yaml'
  if (parts.length === 0) return '/docker-compose.yaml'
  return `/${parts.join('/')}`
}

/** Compose fourni par le dépôt, ou `null` pour un plan sans compose. */
export function repositoryCompose(plan: BuildPlan): RepositoryCompose | null {
  return repositoryComposeForPlan(plan)
}

/** Entrée `docker_compose_domains` de Coolify 4.7.3. */
export interface DockerComposeDomain {
  name: string
  /** Un ou plusieurs domaines séparés par une virgule (Coolify les éclate). */
  domain: string
  redirect?: 'www' | 'non-www' | 'both'
}

/**
 * Domaines attachés au service compose qui porte le trafic public.
 *
 * Coolify refuse `domains` pour une application `dockercompose` : le routage
 * passe uniquement par `docker_compose_domains`. Sans service identifié, on
 * n'attache rien plutôt que de router le domaine vers une base de données.
 */
export function composeDomains(
  hosts: readonly string[],
  service: string | undefined,
): DockerComposeDomain[] {
  const normalized = hosts.map(normalizeHost).filter(Boolean)
  if (!service || normalized.length === 0) return []
  return [
    {
      name: service,
      domain: normalized.map((host) => `https://${host}`).join(','),
    },
  ]
}

/**
 * Volumes persistants activés explicitement. Désactivé par défaut : un
 * déploiement existant ne doit jamais échouer parce que le jeton Coolify ne
 * peut pas créer de stockage.
 */
export function persistentVolumesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.EFLEX_PERSISTENT_VOLUMES?.trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

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

/**
 * Aiguillage du worker, testable sans Coolify ni base :
 * - `compose` : le dépôt fournit son compose, l'Application Coolify le lit ;
 * - `single` : chemin mono-service historique (Nixpacks/Dockerfile) ;
 * - `multiple-without-compose` : plan généré multi-services → refus explicite ;
 * - `invalid-compose` : framework compose sans fichier décrit.
 */
export type DeploymentKind =
  | 'compose'
  | 'single'
  | 'multiple-without-compose'
  | 'invalid-compose'

export function deploymentKind(plan: BuildPlan, artifacts: DeploymentArtifacts): DeploymentKind {
  if (plan.framework === 'compose') {
    return artifacts.repositoryCompose ? 'compose' : 'invalid-compose'
  }
  return artifacts.services.length > 1 ? 'multiple-without-compose' : 'single'
}

/**
 * Mode de construction réellement utilisé par Coolify pour ce plan (affichage
 * et logique portail). Le renderer n'expose que dockercompose/dockerfile ; les
 * frameworks sans Dockerfile ni compose fourni sont construits avec Nixpacks.
 */
export function effectiveBuildPack(
  plan: BuildPlan,
): 'dockercompose' | 'dockerfile' | 'nixpacks' {
  if (plan.framework === 'compose') return 'dockercompose'
  if (plan.framework === 'docker') return 'dockerfile'
  return 'nixpacks'
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
  domain: string | readonly string[],
  port: number,
): string[] {
  const hosts = (Array.isArray(domain) ? domain : [domain]).map(normalizeHost).filter(Boolean)
  return traefikLabels(projectId, 'app', hosts, port, 'proxy')
}

/**
 * Répertoire publié pour un site statique avec Nixpacks. Le chemin reste
 * relatif à `base_directory` : Coolify copie `/app` + ce chemin depuis l'image
 * de build.
 *
 * - application à la racine : comportement historique (`/dist` ou `/`) ;
 * - monorepo de workspace : sortie sous `<root>/<publish>` depuis la racine ;
 * - sous-dossier autonome : la sortie est déjà relative à son propre dossier.
 */
export function publishDirectoryForPlan(plan: BuildPlan): string | undefined {
  if (!STATIC_FRAMEWORKS.has(plan.framework)) return undefined
  const root = appRoot(plan)
  if (root === '') {
    // Coolify valide un chemin absolu (`DIRECTORY_PATH_PATTERN` exige un `/` initial).
    return plan.build ? '/dist' : '/'
  }
  if (plan.workspace) {
    const output = plan.publish ?? (plan.build ? 'dist' : '')
    return `/${[root, output].filter(Boolean).join('/')}`
  }
  return plan.build ? '/dist' : '/'
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
