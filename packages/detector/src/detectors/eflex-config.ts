import type {
  BuildPlan,
  Candidate,
  DetectionContext,
  Framework,
  ServiceSpec,
} from '../types.js';
import { repoRootFromApp } from '../monorepo.js';

export interface EflexConfigOutcome {
  candidate: Candidate | null;
  error: string | null;
}

const FRAMEWORKS: readonly Framework[] = [
  'docker',
  'eflex-config',
  'nextjs',
  'nuxt',
  'astro',
  'vite',
  'node',
  'laravel',
  'php',
  'python',
  'static',
];

const RUNTIME_PATTERN = /^(node|php|python|static|docker)@[0-9]+(\.[0-9]+)?$/;
const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;

function isFramework(value: unknown): value is Framework {
  return typeof value === 'string' && (FRAMEWORKS as readonly string[]).includes(value);
}

function isRuntime(value: unknown): value is string {
  return typeof value === 'string' && RUNTIME_PATTERN.test(value);
}

function stringField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.trim().length === 0) return null;
  if (value.length > 500) return null;
  return value;
}

function integerInRange(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function sanitizeRoot(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
  if (normalized === '') return '';
  const parts = normalized.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..')) return '';
  return parts.join('/');
}

function sanitizeServices(value: unknown): Record<string, ServiceSpec> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const result: Record<string, ServiceSpec> = {};

  for (const [name, rawSpec] of Object.entries(value as Record<string, unknown>)) {
    if (!SERVICE_NAME_PATTERN.test(name)) continue;
    if (typeof rawSpec !== 'object' || rawSpec === null || Array.isArray(rawSpec)) continue;

    const spec = rawSpec as Record<string, unknown>;
    const command = stringField(spec.command);
    if (!command) continue;

    const service: ServiceSpec = { command };
    const replicas = integerInRange(spec.replicas, 1, 10);
    if (replicas !== null) service.replicas = replicas;
    if (typeof spec.healthcheck === 'string' && spec.healthcheck.startsWith('/')) {
      service.healthcheck = spec.healthcheck;
    }
    const port = integerInRange(spec.port, 1, 65535);
    if (port !== null) service.port = port;

    result[name] = service;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeStringList(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .slice(0, maximum);
  const unique = [...new Set(strings)];
  return unique.length > 0 ? unique : null;
}

function sanitizeBuildEnv(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .slice(0, 50);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

function firstServicePort(services: Record<string, ServiceSpec>): number | null {
  for (const service of Object.values(services)) {
    if (service.port !== undefined) return service.port;
  }
  return null;
}

function inferRuntime(
  framework: Framework,
  services: Record<string, ServiceSpec> | null,
  config: Record<string, unknown>,
): string {
  switch (framework) {
    case 'nextjs':
    case 'nuxt':
    case 'node':
      return 'node@22';
    case 'astro':
    case 'vite':
    case 'static':
      return 'static@1';
    case 'laravel':
    case 'php':
      return 'php@8.3';
    case 'python':
      return 'python@3.12';
    case 'docker':
      return 'docker@1';
    case 'eflex-config':
    default: {
      if (services) return 'docker@1';
      const hasStart = stringField(config.start) !== null;
      const hasBuild = stringField(config.build) !== null;
      return hasStart || hasBuild ? 'node@22' : 'static@1';
    }
  }
}

/**
 * Step 0: explicit eflex.json at the application root.
 * Returns null when no config exists, and an outcome with `error` when the
 * file cannot be parsed or has an invalid shape.
 */
export function detectEflexConfig(ctx: DetectionContext): EflexConfigOutcome | null {
  if (!ctx.has('eflex.json')) return null;

  const raw = ctx.read('eflex.json');
  if (raw === null) {
    return { candidate: null, error: '`eflex.json` est présent mais illisible.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { candidate: null, error: `\`eflex.json\` contient un JSON invalide : ${message}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { candidate: null, error: '`eflex.json` doit être un objet JSON.' };
  }

  const config = parsed as Record<string, unknown>;
  if (config.version !== 1) {
    return { candidate: null, error: '`eflex.json` est invalide : la clé `version` doit valoir 1.' };
  }

  const services = sanitizeServices(config.services);
  const framework = isFramework(config.framework) ? config.framework : 'eflex-config';
  const root = sanitizeRoot(config.root);
  const runtime = isRuntime(config.runtime)
    ? config.runtime
    : inferRuntime(framework, services, config);
  const port =
    integerInRange(config.port, 1, 65535) ??
    (services ? firstServicePort(services) ?? 80 : 3000);

  const plan: BuildPlan = {
    version: 1,
    framework,
    runtime,
    root,
    port,
  };

  if (root !== '') plan.repoRoot = repoRootFromApp(root);

  const install = stringField(config.install);
  if (install) plan.install = install;

  const build = stringField(config.build);
  if (build) plan.build = build;

  const start = stringField(config.start);
  if (start) plan.start = start;

  const healthcheck = stringField(config.healthcheck);
  if (healthcheck && healthcheck.startsWith('/')) plan.healthcheck = healthcheck;

  if (services) plan.services = services;

  const volumes = sanitizeStringList(config.volumes, 20);
  if (volumes) plan.volumes = volumes;

  const postDeploy = sanitizeStringList(config.postDeploy, 20);
  if (postDeploy) plan.postDeploy = postDeploy;

  const buildEnv = sanitizeBuildEnv(config.buildEnv);
  if (buildEnv) plan.buildEnv = buildEnv;

  return {
    candidate: {
      framework: 'eflex-config',
      plan,
      confidence: 1,
      reasons: [
        'Configuration explicite `eflex.json` (version 1) détectée : elle remplace la détection automatique.',
      ],
      warnings: [],
      questions: [],
    },
    error: null,
  };
}
