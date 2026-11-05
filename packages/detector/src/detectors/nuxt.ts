import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, nodeRuntimeFor } from './node.js';

/** Nuxt: dependency `nuxt`, served by the Nitro Node server. */
export function detectNuxt(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  if (typeof deps.nuxt !== 'string') return null;

  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'nuxt',
    runtime: runtime.runtime,
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? buildScript : `${pm} run build`,
    start: 'node .output/server/index.mjs',
    port: 3000,
  };

  return {
    framework: 'nuxt',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.nuxt, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendance `nuxt` trouvée dans `package.json`.',
      'Sortie Nitro servie par `node .output/server/index.mjs`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}
