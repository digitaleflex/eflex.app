import type { BuildPlan, Candidate, DetectionContext, ServiceSpec } from '../types.js';
import { BASE_CONFIDENCE, scoreConfidence } from '../confidence.js';
import { phpRuntime } from '../versions.js';

/** Laravel: laravel/framework in composer.json plus an artisan entrypoint. */
export function detectLaravel(ctx: DetectionContext): Candidate | null {
  const composer = ctx.composerJson();
  const requiresLaravel = typeof composer?.require?.['laravel/framework'] === 'string';
  if (!requiresLaravel || !ctx.has('artisan')) return null;

  const php = phpRuntime(composer?.require?.php ?? null);
  const scripts = ctx.scripts();
  const buildScript = scripts.build;
  const hasBuildScript = typeof buildScript === 'string' && buildScript.trim().length > 0;
  const hasHorizon =
    typeof composer?.require?.['laravel/horizon'] === 'string' ||
    typeof composer?.['require-dev']?.['laravel/horizon'] === 'string';
  const hasJobs = ctx.list().some((file) => file.startsWith('app/Jobs/'));
  const hasScheduler = ctx.has('routes/console.php') || ctx.has('app/Console/Kernel.php');
  const hasPublicIndex = ctx.has('public/index.php');
  const hasComposerLock = ctx.has('composer.lock') || ctx.hasRepo('composer.lock');

  const services: Record<string, ServiceSpec> = {
    app: { command: 'php-fpm', port: 9000 },
    web: { command: "nginx -g 'daemon off;'", port: 80, healthcheck: '/' },
  };

  if (hasJobs || hasHorizon) {
    services.queue = {
      command: 'php artisan queue:work --tries=3 --sleep=1',
      replicas: 1,
    };
  }

  if (hasScheduler) {
    services.scheduler = { command: 'php artisan schedule:work' };
  }

  const plan: BuildPlan = {
    version: 1,
    framework: 'laravel',
    runtime: php.runtime,
    root: '',
    install: 'composer install --no-dev --optimize-autoloader',
    ...(hasBuildScript ? { build: 'npm ci && npm run build' } : {}),
    port: 80,
    services,
    volumes: ['storage'],
    postDeploy: [
      'php artisan migrate --force',
      'php artisan config:cache',
      'php artisan route:cache',
      'php artisan view:cache',
      'php artisan queue:restart',
    ],
  };

  const reasons = [
    '`laravel/framework` trouvé dans `composer.json`.',
    'Fichier `artisan` présent à la racine.',
    `Version PHP retenue : ${php.version}.`,
  ];
  if (hasBuildScript) reasons.push('Script `build` présent : les assets front sont compilés.');
  if (services.queue) reasons.push('File d\'attente détectée (`app/Jobs/**` ou Laravel Horizon).');
  if (services.scheduler) reasons.push('Planificateur Laravel détecté.');

  const warnings: string[] = [];
  if (!hasPublicIndex) {
    warnings.push('`public/index.php` est absent : la configuration du serveur web doit être vérifiée.');
  }

  return {
    framework: 'laravel',
    plan,
    confidence: scoreConfidence(BASE_CONFIDENCE.laravel, {
      lockfile: hasComposerLock,
      pinnedRuntime: php.pinned,
      missingEntrypoint: !hasPublicIndex,
    }),
    reasons,
    warnings,
  };
}
