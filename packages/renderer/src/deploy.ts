import { parse, stringify } from 'yaml';
import type { BuildPlan, ComposeContext } from '../../detector/src/types.js';
import { generateDockerfile } from './dockerfile.js';
import { renderStack } from './render.js';
import type { ComposeDocument, RenderContext } from './types.js';

/**
 * Assemble tous les artefacts de déploiement à partir du BuildPlan (issue 02).
 * Le plan est la source de vérité : port réel, services, commandes post-déploiement.
 * Aucun secret n'apparaît ici — ils transitent uniquement par les variables
 * d'environnement de l'orchestrateur.
 */
export interface DeploymentContext {
  projectId: string;
  domain?: string;
  image?: string;
}

export interface DeploymentArtifacts {
  compose: string;
  /** Fichiers à fournir au contexte de build : Dockerfile, nginx/default.conf… */
  files: Record<string, string>;
  envTemplate: string;
  dockerfile: string | null;
  /** Port réellement exposé, issu du plan et non d'une valeur par défaut. */
  portsExposes: number;
  buildPack: 'dockercompose' | 'dockerfile';
  postDeploy: string[];
  services: string[];
  /**
   * Compose fourni par le dépôt (framework `compose`). `null` pour un compose
   * généré : la distinction évite de déployer un faux compose ou de créer des
   * volumes Coolify qui contrediraient ceux du fichier.
   */
  repositoryCompose: RepositoryCompose | null;
  /** Volumes persistants à créer côté orchestrateur (nom + chemin conteneur). */
  persistentVolumes: PersistentVolume[];
  warnings: string[];
}

/** Compose du dépôt, tel qu'il sera lu par Coolify (chemin relatif à `root`). */
export interface RepositoryCompose extends ComposeContext {
  /** Chemin complet dans le dépôt (`apps/api/docker-compose.yml`). */
  repoPath: string;
}

/** Spécification d'un stockage persistant dérivée de `BuildPlan.volumes`. */
export interface PersistentVolume {
  /** Identifiant lisible transmis à Coolify (préfixé par l'UUID de l'application). */
  name: string;
  /** Chemin absolu monté dans le conteneur. */
  mountPath: string;
}

const STATIC_FRAMEWORKS = new Set(['static', 'vite', 'svelte', 'astro']);

interface MutableService {
  image?: string;
  build?: { context: string; dockerfile: string };
  command?: string;
  restart?: string;
  depends_on?: string[];
  networks?: string[];
}

/** Nom de volume accepté par Coolify (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`). */
function volumeName(base: string, used: Map<string, number>): string {
  const slug =
    base
      .replace(/^\//, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '')
      .toLowerCase() || 'data';
  const prefix = `eflex-${slug}`.slice(0, 60).replace(/[-._]+$/g, '');
  const count = (used.get(prefix) ?? 0) + 1;
  used.set(prefix, count);
  return count === 1 ? prefix : `${prefix}-${count}`;
}

/**
 * Traduit `BuildPlan.volumes` en stockages persistants.
 *
 * - chemin absolu (`VOLUME /app/data`) : monté tel quel ;
 * - chemin relatif (`storage`, `eflex.json`) : monté sous `/app`, le répertoire
 *   de travail des images Nixpacks. Docker initialise un volume nommé avec le
 *   contenu de l'image au premier montage : l'arborescence n'est pas masquée.
 */
export function persistentVolumesForPlan(plan: BuildPlan): PersistentVolume[] {
  const used = new Map<string, number>();
  const seen = new Set<string>();
  const volumes: PersistentVolume[] = [];

  for (const volume of plan.volumes ?? []) {
    const trimmed = volume.trim();
    if (trimmed === '') continue;
    const mountPath = trimmed.startsWith('/') ? trimmed : `/app/${trimmed.replace(/^\/+/, '')}`;
    if (seen.has(mountPath)) continue;
    seen.add(mountPath);
    volumes.push({ name: volumeName(trimmed, used), mountPath });
  }

  return volumes;
}

/**
 * Compose fourni par le dépôt, avec le chemin réellement présent dans le
 * dépôt (utile au worker pour relire et valider le fichier avant envoi).
 */
export function repositoryComposeForPlan(plan: BuildPlan): RepositoryCompose | null {
  if (plan.framework !== 'compose' || !plan.compose) return null;
  const location = `/${plan.compose.location.replace(/^\/+/, '')}`;
  const segments = location.split('/').filter(Boolean);
  if (segments.length === 0 || segments.includes('..')) return null;
  const root = (plan.root ?? '').trim().replace(/^\/+|\/+$/g, '');
  const repoPath = root === '' ? location.slice(1) : `${root}${location}`;
  return {
    location,
    repoPath,
    services: plan.compose.services ?? [],
    ...(plan.compose.service ? { service: plan.compose.service } : {}),
  };
}

export function buildDeploymentArtifacts(
  plan: BuildPlan,
  ctx: DeploymentContext,
): DeploymentArtifacts {
  const image = ctx.image ?? `eflex/${ctx.projectId}:latest`;
  const renderCtx: RenderContext = {
    projectId: ctx.projectId,
    image,
    domain: ctx.domain,
    network: 'proxy',
  };
  const rendered = renderStack(plan, renderCtx);
  const dockerfile = generateDockerfile(plan);

  const files: Record<string, string> = { ...rendered.files };
  if (dockerfile) files['Dockerfile'] = dockerfile;
  if (rendered.envTemplate) files['.env.example'] = rendered.envTemplate;

  const ports = rendered.metadata.ports;
  const portsExposes = ports.web ?? ports.app ?? plan.port;
  const buildPack: 'dockercompose' | 'dockerfile' =
    plan.framework === 'docker' ? 'dockerfile' : 'dockercompose';

  let compose = rendered.compose;
  if (buildPack === 'dockercompose' && dockerfile) {
    const doc = parse(compose) as ComposeDocument;
    const services = doc.services as Record<string, MutableService>;
    const primary = services.app ? 'app' : (ports.web !== undefined ? 'web' : 'app');

    // Le dépôt est le contexte de build : l'image est construite localement,
    // aucun registre n'est nécessaire.
    for (const [name, service] of Object.entries(services)) {
      const ours = service.image === image || (STATIC_FRAMEWORKS.has(plan.framework) && name === 'web');
      if (ours) {
        service.image = image;
        service.build = { context: '.', dockerfile: 'Dockerfile' };
      }
    }

    // postDeploy (ex. `php artisan migrate --force`) devient un service
    // one-shot du compose : déterministe, visible et rejouable.
    if (plan.postDeploy?.length) {
      services.migrate = {
        image,
        build: { context: '.', dockerfile: 'Dockerfile' },
        command: plan.postDeploy.join(' && '),
        restart: 'no',
        depends_on: [primary],
        networks: ['internal'],
      };
    }
    compose = stringify(doc, { lineWidth: 0 });
  }

  return {
    compose: buildPack === 'dockerfile' ? '' : compose,
    files,
    envTemplate: rendered.envTemplate,
    dockerfile,
    portsExposes,
    buildPack,
    postDeploy: plan.postDeploy ?? [],
    services: rendered.metadata.services,
    repositoryCompose: repositoryComposeForPlan(plan),
    persistentVolumes:
      plan.framework === 'compose' ? [] : persistentVolumesForPlan(plan),
    warnings: rendered.metadata.warnings,
  };
}
