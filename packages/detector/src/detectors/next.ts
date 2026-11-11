import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, nodeRuntimeFor, withJsTooling } from './node.js';

const NEXT_CONFIG_FILES = ['next.config.js', 'next.config.mjs', 'next.config.ts'];

/** Next.js: dependency or config file. */
export function detectNext(ctx: DetectionContext): Candidate | null {
  const pkg = ctx.packageJson();
  const deps = ctx.deps();
  const hasConfig = NEXT_CONFIG_FILES.some((file) => ctx.has(file));
  const hasNextDependency = typeof deps.next === 'string';
  if (!hasNextDependency && !hasConfig) return null;

  const runtime = nodeRuntimeFor(ctx);
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  const startScript = scripts.start;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const hasStartScript = typeof startScript === 'string' && startScript.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'nextjs',
    runtime: runtime.runtime,
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? buildScript : `${pm} run build`,
    start: hasStartScript ? startScript : 'next start',
    port: 3000,
  };

  const reasons: string[] = [];
  if (hasNextDependency) reasons.push('Dépendance `next` trouvée dans `package.json`.');
  if (hasConfig) reasons.push('Fichier de configuration Next.js détecté.');
  reasons.push(`Gestionnaire de paquets détecté : ${pm}.`);

  return withJsTooling(ctx, {
    framework: 'nextjs',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.nextjs, {
      lockfile: ctx.hasJsLockfile(),
      pinnedRuntime: runtime.pinned,
      missingBuildScript: !hasBuildScript,
    }),
    reasons,
    warnings: ["Pour un démarrage optimisé, activez `output: 'standalone'` dans next.config."],
  });
}
