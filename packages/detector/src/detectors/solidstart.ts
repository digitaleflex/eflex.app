import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, nodeRuntimeFor } from './node.js';

/** SolidStart: dependency `solid-start`, served by the SolidJS server. */
export function detectSolidStart(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  if (typeof deps['solid-start'] !== 'string') return null;

  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'solidstart',
    runtime: runtime.runtime,
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? buildScript : `${pm} run build`,
    start: 'solid start',
    port: 3000,
  };

  return {
    framework: 'solidstart',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.solidstart, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendance `solid-start` trouvée dans `package.json`.',
      'Framework SolidJS détecté avec sortie serveur.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  };
}