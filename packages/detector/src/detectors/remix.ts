import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, nodeRuntimeFor, withJsTooling } from './node.js';

/** Remix: dependency `remix`, configured with `remix.config.js`. */
export function detectRemix(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  if (typeof deps.remix !== 'string') return null;

  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const pm = ctx.packageManager();
  const hasRemixConfig = ctx.has('remix.config.js') || ctx.has('remix.config.ts');

  const plan: BuildPlan = {
    version: 1,
    framework: 'remix',
    runtime: runtime.runtime,
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? buildScript : `${pm} run build`,
    start: 'node ./dist/server/index.js',
    port: 3000,
  };

  return withJsTooling(ctx, {
    framework: 'remix',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.remix, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingBuildScript: !hasBuildScript,
      hasRemixConfig,
    }),
    reasons: [
      'Dépendance `remix` trouvée dans `package.json`.',
      'Configuration Remix détectée (`remix.config.js` ou `.ts`).',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  });
}