import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand } from './node.js';

/** A package.json with a build script plus a root index.html. */
export function detectStaticBuild(ctx: DetectionContext): Candidate | null {
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  if (typeof buildScript !== 'string' || buildScript.trim().length === 0) return null;
  if (!ctx.has('index.html')) return null;

  const pm = ctx.packageManager();
  const plan: BuildPlan = {
    version: 1,
    framework: 'static',
    runtime: 'static@1',
    root: '',
    install: installCommand(ctx),
    build: `${pm} run build`,
    publish: 'dist',
    port: 80,
  };

  return {
    framework: 'static',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.static, {
      lockfile: ctx.hasJsLockfile(),
    }),
    reasons: [
      '`package.json` contient un script `build` et `index.html` est présent.',
      'La sortie est servie en statique avec le runtime `static@1`.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}

/** A plain index.html without any build step. */
export function detectStaticIndex(ctx: DetectionContext): Candidate | null {
  if (!ctx.has('index.html')) return null;

  const plan: BuildPlan = {
    version: 1,
    framework: 'static',
    runtime: 'static@1',
    root: '',
    port: 80,
  };

  return {
    framework: 'static',
    plan,
    confidence: BASE_CONFIDENCE.static,
    reasons: ['`index.html` détecté à la racine : site statique sans étape de build.'],
    warnings: [],
  };
}
