import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { nodeRuntime } from '../versions.js';

/** Install command matching the lockfile-derived package manager. */
export function installCommand(ctx: DetectionContext): string {
  switch (ctx.packageManager()) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile';
    case 'yarn':
      return 'yarn install --frozen-lockfile';
    case 'bun':
      return 'bun install --frozen-lockfile';
    case 'npm':
    default:
      return 'npm ci';
  }
}

export function runScriptCommand(ctx: DetectionContext, script: string): string {
  return `${ctx.packageManager()} run ${script}`;
}

export function nodeRuntimeFor(ctx: DetectionContext): { runtime: string; pinned: boolean } {
  const pkg = ctx.packageJson();
  return nodeRuntime(pkg?.engines?.node ?? null);
}

export function hasScript(ctx: DetectionContext, name: string): boolean {
  const value = ctx.scripts()[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNodeEntrypoint(ctx: DetectionContext): boolean {
  return ['index.js', 'server.js', 'src/index.js', 'src/server.js'].some((file) => ctx.has(file));
}

/** NestJS: @nestjs/core in dependencies. */
export function detectNest(ctx: DetectionContext): Candidate | null {
  const deps = ctx.deps();
  if (typeof deps['@nestjs/core'] !== 'string') return null;

  const pkg = ctx.packageJson();
  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const startScript = scripts['start:prod'];
  const buildScript = scripts.build;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'node',
    runtime: runtime.runtime,
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? buildScript : `${pm} run build`,
    start: typeof startScript === 'string' && startScript.trim().length > 0 ? startScript : 'node dist/main.js',
    port: 3000,
  };

  return {
    framework: 'node',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.node, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendance `@nestjs/core` trouvée dans `package.json`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}

/** Express, Fastify, Koa or Hono HTTP servers. */
export function detectServerFramework(ctx: DetectionContext): Candidate | null {
  const deps = ctx.deps();
  const servers = ['express', 'fastify', 'koa', 'hono'].filter((name) => typeof deps[name] === 'string');
  if (servers.length === 0) return null;

  const pkg = ctx.packageJson();
  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const startScript = scripts.start;
  const buildScript = scripts.build;
  const hasStartScript = typeof startScript === 'string' && startScript.trim().length > 0;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const hasEntrypoint = hasStartScript || hasNodeEntrypoint(ctx);
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'node',
    runtime: runtime.runtime,
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    ...(hasBuildScript ? { build: buildScript } : {}),
    start: hasStartScript ? startScript : 'node index.js',
    port: 3000,
  };

  return {
    framework: 'node',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.node, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingEntrypoint: !hasEntrypoint,
    }),
    reasons: [
      `Dépendance(s) serveur HTTP détectée(s) : ${servers.map((name) => `\`${name}\``).join(', ')}.`,
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}

/** Last-resort Node.js detection when package.json exists but nothing matched. */
export function detectNodeFallback(ctx: DetectionContext): Candidate | null {
  if (!ctx.packageJson()) return null;

  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const startScript = scripts.start;
  const buildScript = scripts.build;
  const hasStartScript = typeof startScript === 'string' && startScript.trim().length > 0;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;

  const plan: BuildPlan = {
    version: 1,
    framework: 'node',
    runtime: runtime.runtime,
    root: '',
    install: installCommand(ctx),
    ...(hasBuildScript ? { build: buildScript } : {}),
    start: hasStartScript ? startScript : 'node index.js',
    port: 3000,
  };

  return {
    framework: 'node',
    plan,
    confidence: scoreConfidence(0.55, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingEntrypoint: !hasStartScript && !hasNodeEntrypoint(ctx),
    }),
    reasons: ['`package.json` détecté, mais aucun framework connu n\'a été identifié.'],
    warnings: ['Aucun framework reconnu : commande de démarrage à confirmer.'],
  };
}
