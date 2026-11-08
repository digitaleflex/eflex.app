import { parse, stringify } from 'yaml';
import type { BuildPlan } from '../../detector/src/types.js';
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
  warnings: string[];
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
    warnings: rendered.metadata.warnings,
  };
}
