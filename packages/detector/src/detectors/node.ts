import type { BuildPlan, Candidate, DetectionContext, PackageManager } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { nodeRuntime } from '../versions.js';

/** `pnpm-workspace.yaml` sans `packages` : pnpm le traite comme un workspace vide et échoue. */
function pnpmWorkspaceWithoutPackages(ctx: DetectionContext): boolean {
  const content = ctx.read('pnpm-workspace.yaml') ?? ctx.readRepo('pnpm-workspace.yaml')
  if (content === null) return false
  return !/^\s*packages\s*:/m.test(content)
}

/** Install command matching the declared/lockfile-derived package manager. */
export function installCommand(ctx: DetectionContext): string {
  const pm = ctx.packageManager();
  const hasLockfile = ctx.hasJsLockfile();
  const declaresManager = typeof ctx.packageJson()?.packageManager === 'string';
  // Corepack active la version exacte demandée par `packageManager` (pnpm, yarn,
  // npm). Bun n'est pas géré par Corepack.
  const corepack = declaresManager && pm !== 'bun' ? 'corepack enable && ' : '';

  switch (pm) {
    case 'pnpm': {
      // Certains dépôts utilisent pnpm-workspace.yaml uniquement pour des
      // réglages (ignoredBuiltDependencies) sans champ `packages`. Sans ce
      // drapeau, `pnpm install` échoue avec « packages field missing or empty ».
      const ignoreWorkspace = pnpmWorkspaceWithoutPackages(ctx) ? ' --ignore-workspace' : '';
      return `${corepack}pnpm install${hasLockfile ? ' --frozen-lockfile' : ''}${ignoreWorkspace}`;
    }
    case 'yarn': {
      const berry = ctx.has('.yarnrc.yml') || (ctx.read('yarn.lock') ?? '').includes('__metadata:');
      return `${corepack}yarn install${hasLockfile ? (berry ? ' --immutable' : ' --frozen-lockfile') : ''}`;
    }
    case 'bun':
      return `bun install${hasLockfile ? ' --frozen-lockfile' : ''}`;
    case 'npm':
    default:
      return `${corepack}${hasLockfile ? 'npm ci' : 'npm install'}`;
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

function normalizeVersion(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim().replace(/^v/i, '');
  if (!raw) return null;
  if (!/^[0-9][0-9A-Za-z.+_-]*$/.test(raw)) return null;
  return raw;
}

function declaredPackageManagerVersion(ctx: DetectionContext): string | null {
  const declared = ctx.packageJson()?.packageManager;
  if (typeof declared !== 'string') return null;
  const at = declared.indexOf('@');
  if (at === -1) return null;
  return normalizeVersion(declared.slice(at + 1));
}

function bunVersionFromToolFiles(ctx: DetectionContext): string | null {
  const bunVersionFile = ctx.read('.bun-version') ?? ctx.readRepo('.bun-version');
  const direct = normalizeVersion(bunVersionFile?.split(/\r?\n/, 1)[0] ?? null);
  if (direct) return direct;

  const toolVersions = ctx.read('.tool-versions') ?? ctx.readRepo('.tool-versions');
  if (toolVersions) {
    for (const line of toolVersions.split(/\r?\n/)) {
      const match = line.trim().match(/^bun\s+([^\s#]+)/i);
      if (match?.[1]) {
        const parsed = normalizeVersion(match[1]);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

function bunLockfileInfo(ctx: DetectionContext): { file: 'bun.lock' | 'bun.lockb' | null; version: number | null } {
  if (ctx.has('bun.lock') || ctx.hasRepo('bun.lock')) {
    const content = (ctx.read('bun.lock') ?? ctx.readRepo('bun.lock') ?? '').trimStart();
    const jsonMatch = content.match(/"lockfileVersion"\s*:\s*(\d+)/);
    if (jsonMatch?.[1]) return { file: 'bun.lock', version: Number.parseInt(jsonMatch[1], 10) };
    const tomlMatch = content.match(/^\s*lockfileVersion\s*=\s*(\d+)/m);
    if (tomlMatch?.[1]) return { file: 'bun.lock', version: Number.parseInt(tomlMatch[1], 10) };
    return { file: 'bun.lock', version: null };
  }
  if (ctx.has('bun.lockb') || ctx.hasRepo('bun.lockb')) return { file: 'bun.lockb', version: null };
  return { file: null, version: null };
}

export function jsPackageManagerFields(ctx: DetectionContext): {
  packageManager?: PackageManager;
  packageManagerVersion?: string;
  reasons: string[];
  warnings: string[];
} {
  const pm = ctx.packageManager();
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (pm === 'bun') {
    const fromDeclared = declaredPackageManagerVersion(ctx);
    const fromTool = bunVersionFromToolFiles(ctx);
    const version = fromDeclared ?? fromTool ?? null;
    if (version) {
      reasons.push(`Version de Bun détectée : \`${version}\`.`);
    } else {
      warnings.push(
        'Bun est utilisé mais aucune version n\'a pu être déterminée (`packageManager`, `.bun-version` ou `.tool-versions`). Épinglez la version de Bun pour éviter un écart avec l\'environnement de build.',
      );
    }

    const lock = bunLockfileInfo(ctx);
    if (lock.file === 'bun.lock' && lock.version !== null) {
      reasons.push(`Format du lockfile Bun détecté : \`${lock.file}\` (lockfileVersion ${lock.version}).`);
      if (lock.version >= 2) {
        warnings.push(
          `Le fichier \`bun.lock\` utilise le format \`lockfileVersion\` ${lock.version}. Assurez-vous que la version de Bun utilisée pour le build sait lire ce format (sinon \`bun install --frozen-lockfile\` échouera).`,
        );
      }
    }

    return {
      packageManager: pm,
      ...(version ? { packageManagerVersion: version } : {}),
      reasons,
      warnings,
    };
  }

  const declaredVersion = declaredPackageManagerVersion(ctx);
  return {
    packageManager: pm,
    ...(declaredVersion ? { packageManagerVersion: declaredVersion } : {}),
    reasons,
    warnings,
  };
}

export function withJsTooling<T extends { framework: BuildPlan['framework']; plan: BuildPlan; reasons: string[]; warnings: string[] }>(
  ctx: DetectionContext,
  candidate: T,
): T {
  const tooling = jsPackageManagerFields(ctx);
  candidate.plan = {
    ...candidate.plan,
    ...(tooling.packageManager ? { packageManager: tooling.packageManager } : {}),
    ...(tooling.packageManagerVersion ? { packageManagerVersion: tooling.packageManagerVersion } : {}),
  };
  candidate.reasons = [...candidate.reasons, ...tooling.reasons];
  candidate.warnings = [...candidate.warnings, ...tooling.warnings];
  return candidate;
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

  return withJsTooling(ctx, {
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
  });
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

  return withJsTooling(ctx, {
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
  });
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

  return withJsTooling(ctx, {
    framework: 'node',
    plan,
    confidence: scoreConfidence(0.55, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingEntrypoint: !hasStartScript && !hasNodeEntrypoint(ctx),
    }),
    reasons: ['`package.json` détecté, mais aucun framework connu n\'a été identifié.'],
    warnings: ['Aucun framework reconnu : commande de démarrage à confirmer.'],
  });
}
