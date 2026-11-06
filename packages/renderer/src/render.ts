import type { BuildPlan, ComposeOptions, RenderContext, RenderedStack } from './types.js';
import { RenderError } from './errors.js';
import { generateNginxConfig } from './nginx.js';
import { generateEnvTemplate } from './env.js';
import { appService, newCompose, serializeCompose, webService, workerService } from './compose.js';

const PROJECT_ID_RE = /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/;

function validateProjectId(id: string): void {
  if (!PROJECT_ID_RE.test(id)) {
    throw new RenderError(
      `Identifiant de projet invalide : "${id}". ` +
      `Utilisez uniquement des minuscules, chiffres et tirets (ex: "mon-projet-42").`,
    );
  }
}

function composeOptions(ctx: RenderContext): ComposeOptions {
  return {
    projectId: ctx.projectId,
    network: ctx.network ?? 'eflex-proxy',
    resources: ctx.resources,
    domain: ctx.domain,
    traefik: ctx.traefik,
  };
}

export function renderStack(plan: BuildPlan, ctx: RenderContext): RenderedStack {
  validateProjectId(ctx.projectId);

  const opts = composeOptions(ctx);
  const doc = newCompose(`eflex-${ctx.projectId}`);
  const files: Record<string, string> = {};
  const warnings: string[] = [];
  const ports: Record<string, number> = {};

  switch (plan.framework) {
    case 'docker': {
      const svc = appService(ctx.projectId, ctx.image, plan.port, opts, {
        healthcheck: plan.healthcheck,
      });
      if (plan.volumes) {
        svc.volumes = plan.volumes.map((v) => `${ctx.projectId}_${v.replace(/^\//, '').replace(/\//g, '_')}:${v}`);
      }
      doc.services.app = svc;
      ports.app = plan.port;

      if (plan.buildArgs) {
        warnings.push(
          `Arguments de build détectés : ${Object.keys(plan.buildArgs).join(', ')}. ` +
          `Ces valeurs sont figées dans l'image au moment du build et ne peuvent pas être changées au runtime.`,
        );
      }
      break;
    }

    case 'laravel': {
      const svcs = plan.services ?? {};
      const storageVol = `${ctx.projectId}_storage`;

      doc.services.app = {
        ...appService(ctx.projectId, ctx.image, 9000, opts),
        command: svcs.app?.command ?? 'php-fpm',
        volumes: [`${storageVol}:/var/www/html/storage`],
        labels: undefined, // nginx handles public traffic
      };

      doc.services.web = webService(ctx.projectId, 80, opts, {
        dependsOn: ['app'],
      });
      files['nginx/default.conf'] = generateNginxConfig();
      ports.web = 80;

      if (svcs.queue) {
        doc.services.queue = workerService(
          svcs.queue.command,
          opts,
          { replicas: svcs.queue.replicas, volumes: [`${storageVol}:/var/www/html/storage`] },
        );
      }

      if (plan.services?.scheduler) {
        doc.services.scheduler = workerService(
          plan.services.scheduler.command,
          opts,
          { volumes: [`${storageVol}:/var/www/html/storage`] },
        );
      }

      doc.volumes = { [storageVol]: {} };
      break;
    }

    case 'nextjs':
    case 'nuxt':
    case 'node':
    case 'python': {
      const svc = appService(ctx.projectId, ctx.image, plan.port, opts, {
        command: plan.start,
        healthcheck: plan.healthcheck,
      });
      doc.services.app = svc;
      ports.app = plan.port;
      break;
    }

    case 'static':
    case 'vite':
    case 'astro': {
      doc.services.web = webService(ctx.projectId, 80, opts);
      ports.web = 80;
      break;
    }

    case 'eflex-config': {
      if (plan.services) {
        for (const [name, spec] of Object.entries(plan.services)) {
          if (spec.command.includes('nginx') || spec.command.includes('serve') || name === 'web') {
            doc.services[name] = webService(ctx.projectId, spec.port ?? 80, opts, {
              image: ctx.image,
              dependsOn: Object.keys(plan.services).filter((k) => k !== name),
            });
            ports[name] = spec.port ?? 80;
          } else if (name === 'app' || spec.port) {
            doc.services[name] = appService(ctx.projectId, ctx.image, spec.port ?? plan.port, opts, {
              command: spec.command,
              healthcheck: spec.healthcheck,
            });
            ports[name] = spec.port ?? plan.port;
          } else {
            doc.services[name] = workerService(spec.command, opts, {
              image: ctx.image,
              replicas: spec.replicas,
            });
          }
        }
      } else {
        doc.services.app = appService(ctx.projectId, ctx.image, plan.port, opts);
        ports.app = plan.port;
      }
      break;
    }

    default:
      throw new RenderError(
        `Framework "${plan.framework}" non pris en charge par le renderer.`,
      );
  }

  // Post-process: replace IMAGE placeholder for workers, add env refs
  for (const svc of Object.values(doc.services)) {
    if (svc.image === '${IMAGE}') {
      svc.image = ctx.image;
    }
  }

  const envTemplate = ctx.env ? generateEnvTemplate(ctx.env) : '';

  const serviceNames = Object.keys(doc.services);

  // Collect all volume names
  const volumeNames = Object.values(doc.services).flatMap((s) => {
    const vols = s.volumes ?? [];
    return vols.map((v) => v.split(':')[0] ?? '');
  });

  return {
    compose: serializeCompose(doc),
    files,
    envTemplate,
    metadata: {
      services: serviceNames,
      ports,
      volumes: [...new Set(volumeNames)],
      warnings,
    },
  };
}

export function renderStackDeterministic(plan: BuildPlan, ctx: RenderContext): RenderedStack {
  // Ensure deterministic output by stabilizing inputs
  const stableCtx: RenderContext = {
    ...ctx,
    env: ctx.env ? Object.fromEntries(
      Object.entries(ctx.env).sort(([a], [b]) => a.localeCompare(b))
    ) : undefined,
  };
  return renderStack(plan, stableCtx);
}