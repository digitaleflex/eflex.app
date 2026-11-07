import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand } from './node.js';

/** Svelte: dependency `svelte`, built output served statically. */
export function detectSvelte(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  if (typeof deps.svelte !== 'string') return null;

  const scripts = ctx.scripts();
  const hasBuildScript = typeof scripts.build === 'string' && scripts.build.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'svelte',
    runtime: 'static@1',
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? scripts.build : 'svelte build',
    // Sortie par défaut de @sveltejs/adapter-static.
    publish: 'build',
    port: 80,
  };

  return {
    framework: 'svelte',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.svelte, {
      lockfile: ctx.hasJsLockfile(),
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendance `svelte` trouvée dans `package.json`.',
      'La sortie est servie en statique avec le runtime `static@1`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}