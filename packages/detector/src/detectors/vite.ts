import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, runScriptCommand, withJsTooling } from './node.js';

/** Vite: dependency `vite`, built output served statically. */
export function detectVite(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  if (typeof deps.vite !== 'string') return null;

  const scripts = ctx.scripts();
  const hasBuildScript = typeof scripts.build === 'string' && scripts.build.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'vite',
    runtime: 'static@1',
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: runScriptCommand(ctx, 'build'),
    publish: 'dist',
    port: 80,
  };

  return withJsTooling(ctx, {
    framework: 'vite',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.vite, {
      lockfile: ctx.hasJsLockfile(),
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendance `vite` trouvée dans `package.json`.',
      'La sortie est servie en statique avec le runtime `static@1`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  });
}
