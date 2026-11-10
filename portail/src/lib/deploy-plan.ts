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
}

export function coolifyApplicationSettings(plan: BuildPlan): CoolifyApplicationSettings {
  const root = appRoot(plan)
  // Le contexte Docker fait exception : le Dockerfile et son contexte de build
  // sont pensés par l'auteur du dépôt relativement au dossier de l'application.
  const workspace = plan.framework === 'docker' ? undefined : plan.workspace
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
  }
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
