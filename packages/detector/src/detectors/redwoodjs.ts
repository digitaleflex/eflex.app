import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { installCommand, withJsTooling } from './node.js';

/** RedwoodJS: dépendances @redwoodjs/api, @redwoodjs/db, etc. */
export function detectRedwoodjs(ctx: DetectionContext): Candidate | null {
  const deps = ctx.deps();
  const hasRedwood =
    typeof deps['@redwoodjs/api'] === 'string' ||
    typeof deps['@redwoodjs/db'] === 'string';

  if (!hasRedwood) return null;

  const pkg = ctx.packageJson();
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const pm = ctx.packageManager();

  const plan: BuildPlan = {
    version: 1,
    framework: 'redwoodjs',
    runtime: 'node@20',
    root: '',
    ...(pkg ? { install: installCommand(ctx) } : {}),
    build: hasBuildScript ? buildScript : `${pm} run build`,
    start: 'redwood serve',
    port: 8910,
  };

  return withJsTooling(ctx, {
    framework: 'redwoodjs',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.redwoodjs, {
      lockfile: ctx.hasJsLockfile(),
      missingBuildScript: !hasBuildScript,
    }),
    reasons: [
      'Dépendances RedwoodJS détectées (@redwoodjs/api, @redwoodjs/db).',
      'Framework fullstack React + Prisma + GraphQL.',
      `Gestionnaire de paquets détecté : ${pm}.`,
    ],
    warnings: [],
  });
}