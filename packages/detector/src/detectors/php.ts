import type { BuildPlan, Candidate, DetectionContext } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { phpRuntime } from '../versions.js';

/** Generic PHP: composer.json or a root index.php. */
export function detectPhp(ctx: DetectionContext): Candidate | null {
  const composer = ctx.composerJson();
  const hasComposer = ctx.has('composer.json');
  const hasRootIndex = ctx.has('index.php');
  const hasPublicIndex = ctx.has('public/index.php');
  if (!hasComposer && !hasRootIndex && !hasPublicIndex) return null;

  const php = phpRuntime(composer?.require?.php ?? null);
  const hasComposerLock = ctx.has('composer.lock') || ctx.hasRepo('composer.lock');

  const plan: BuildPlan = {
    version: 1,
    framework: 'php',
    runtime: php.runtime,
    root: '',
    ...(hasComposer ? { install: 'composer install --no-dev --optimize-autoloader' } : {}),
    start: hasPublicIndex ? 'php -S 0.0.0.0:80 -t public' : 'php -S 0.0.0.0:80',
    port: 80,
  };

  return {
    framework: 'php',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.php, {
      lockfile: hasComposerLock,
      pinnedRuntime: php.pinned,
      missingEntrypoint: !hasRootIndex && !hasPublicIndex,
    }),
    reasons: [
      hasComposer ? '`composer.json` détecté à la racine.' : '`index.php` détecté à la racine.',
      `Version PHP retenue : ${php.version}.`,
      'Serveur PHP intégré utilisé pour démarrer l\'application.',
    ],
    warnings: [],
  };
}
