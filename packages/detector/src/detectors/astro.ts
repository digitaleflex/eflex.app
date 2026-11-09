import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, runScriptCommand } from './node.js';

/** Astro: dependency `astro`, built output served statically. */
export function detectAstro(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  if (typeof deps.astro !== 'string') return null;

  const scripts = ctx.scripts();
  const hasBuildScript = typeof scripts.build === 'string' && scripts.build.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'astro',
    runtime: 'static@1',
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: runScriptCommand(ctx, 'build'),
    publish: 'dist',
    port: 80,
  };

  return {
    framework: 'astro',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.astro, {
      lockfile: ctx.hasJsLockfile(),
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendance `astro` trouvée dans `package.json`.',
      'La sortie est servie en statique avec le runtime `static@1`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}
