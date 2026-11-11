import { describe, expect, it } from 'vitest';
import { detect, detectApplication, scoreConfidence } from '../src/index.js';
import {
  allFixtures,
  astro,
  composeMonorepoApp,
  composeRoot,
  composeYaml,
  django,
  dockerfile,
  dockerfileArgBeforeFrom,
  dockerfileArgDefault,
  dockerfileArgRequired,
  dockerfileExpose,
  dockerfileMultiExpose,
  dockerfilePhpFpm,
  dockerfileVolume,
  eflexConfig,
  eflexConfigCompose,
  eflexConfigInvalid,
  eflexConfigStatic,
  eflexConfigUnsafePaths,
  dockerfileInSubdir,
  express,
  fastapi,
  laravelFull,
  laravelMinimal,
  laravelVite,
  monorepoMultiple,
  monorepoSingle,
  monorepoWorkspace,
  nextjs,
  nextjsWithBun,
  nextjsWithBunLockV2,
  nextjsWithDeclaredPnpm,
  nextjsWithEngines,
  nextjsWithPnpm,
  nextjsWithPnpmSettingsOnly,
  nextjsWithYarnBerry,
  phpGeneric,
  staticSite,
  staticSiteWithBuild,
  unknownRepo,
  vite,
} from './fixtures.js';

describe('detect', () => {
  it('detects Next.js with port 3000 and respects the build script', () => {
    const result = detect(nextjs);

    expect(result.framework).toBe('nextjs');
    expect(result.plan?.framework).toBe('nextjs');
    expect(result.plan?.runtime).toBe('node@22');
    expect(result.plan?.port).toBe(3000);
    expect(result.plan?.build).toBe('next build');
    expect(result.plan?.start).toBe('next start');
    expect(result.warnings.join(' ')).toContain('standalone');
  });

  it('indique le dossier des fichiers construits des sites statiques', () => {
    expect(detect(vite).plan?.publish).toBe('dist');
    expect(detect(astro).plan?.publish).toBe('dist');
    expect(detect(staticSiteWithBuild).plan?.publish).toBe('dist');
    // Site statique sans build : la racine est servie, rien à publier à part.
    expect(detect(staticSite).plan?.publish).toBeUndefined();
  });

  it('retient le Dockerfile situé dans docker/ et ignore celui de la racine', () => {
    expect(detect(dockerfileInSubdir).plan?.dockerfile).toBe('docker/Dockerfile');
    expect(detect(dockerfile).plan?.dockerfile).toBeUndefined();
  });

  it('détecte un compose fourni par le dépôt avant le Dockerfile', () => {
    const result = detect(composeRoot);

    expect(result.framework).toBe('compose');
    expect(result.plan?.framework).toBe('compose');
    expect(result.plan?.runtime).toBe('docker@1');
    expect(result.plan?.compose).toEqual({
      location: '/docker-compose.yml',
      services: ['app', 'web', 'queue'],
      service: 'web',
    });
    expect(result.reasons.join(' ')).toContain('3 service(s)');
    expect(result.warnings.join(' ')).toContain('fait foi');
    // Le manifeste Next.js reste visible comme alternative, sans gagner.
    expect(result.alternatives.some((plan) => plan.framework === 'nextjs')).toBe(true);
  });

  it('reconnaît compose.yaml et choisit le service au port HTTP', () => {
    const result = detect(composeYaml);

    expect(result.plan?.compose?.location).toBe('/compose.yaml');
    expect(result.plan?.compose?.services).toEqual(['api', 'db']);
    expect(result.plan?.compose?.service).toBe('api');
  });

  it('résout un compose placé dans l’application d’un monorepo', () => {
    const result = detect(composeMonorepoApp);

    expect(result.framework).toBe('compose');
    expect(result.plan?.root).toBe('apps/api');
    expect(result.plan?.repoRoot).toBe('../..');
    expect(result.plan?.compose?.location).toBe('/compose.yml');
    expect(result.plan?.compose?.service).toBe('app');
  });

  it('avertit quand le compose ne déclare pas de labels websecure', () => {
    const result = detect(composeYaml);
    expect(result.warnings.join(' ')).toContain('websecure');
  });

  it('lit publish depuis eflex.json et écarte les chemins qui sortent du dépôt', () => {
    expect(detect(eflexConfigStatic).plan?.publish).toBe('out/site');

    const unsafe = detect(eflexConfigUnsafePaths).plan;
    expect(unsafe?.publish).toBeUndefined();
    expect(unsafe?.dockerfile).toBeUndefined();
  });

  it('accepte un compose explicite dans eflex.json', () => {
    const plan = detect(eflexConfigCompose).plan;

    expect(plan?.framework).toBe('compose');
    expect(plan?.compose).toEqual({
      location: '/docker/compose.yaml',
      services: ['app', 'worker'],
      service: 'app',
    });
  });

  it('detects Vite as a static runtime on port 80', () => {
    const result = detect(vite);

    expect(result.framework).toBe('vite');
    expect(result.plan?.framework).toBe('vite');
    expect(result.plan?.runtime).toBe('static@1');
    expect(result.plan?.port).toBe(80);
    expect(result.plan?.build).toBe('npm run build');
  });

  it('detects Astro as a static runtime on port 80', () => {
    const result = detect(astro);

    expect(result.framework).toBe('astro');
    expect(result.plan?.runtime).toBe('static@1');
    expect(result.plan?.port).toBe(80);
  });

  it('detects Express as a Node service on port 3000', () => {
    const result = detect(express);

    expect(result.framework).toBe('node');
    expect(result.plan?.runtime).toBe('node@22');
    expect(result.plan?.port).toBe(3000);
    expect(result.plan?.start).toBe('node server.js');
  });

  it('detects a full Laravel application with queue and scheduler services', () => {
    const result = detect(laravelFull);

    expect(result.framework).toBe('laravel');
    expect(result.plan?.runtime).toBe('php@8.3');
    expect(Object.keys(result.plan?.services ?? {})).toEqual(['app', 'web', 'queue', 'scheduler']);
    expect(result.plan?.services?.queue?.replicas).toBe(1);
    expect(result.plan?.volumes).toEqual(['storage']);
    expect(result.plan?.postDeploy).toContain('php artisan migrate --force');
    expect(result.plan?.build).toBe('npm install && npm run build');
  });

  it('detects Laravel (not static Vite) when Vite compiles the front-end assets', () => {
    const result = detect(laravelVite);

    expect(result.framework).toBe('laravel');
    expect(result.plan?.runtime).toBe('php@8.3');
    expect(result.plan?.build).toBe('npm ci && npm run build');
    expect(result.plan?.services?.web).toBeDefined();
  });

  it('detects a minimal Laravel application with only app and web services', () => {
    const result = detect(laravelMinimal);

    expect(result.framework).toBe('laravel');
    expect(Object.keys(result.plan?.services ?? {})).toEqual(['app', 'web']);
    expect(result.plan?.volumes).toEqual(['storage']);
  });

  it('detects generic PHP with confidence at most 0.75', () => {
    const result = detect(phpGeneric);

    expect(result.framework).toBe('php');
    expect(result.plan?.port).toBe(80);
    expect(result.confidence).toBeLessThanOrEqual(0.75);
  });

  it('detects FastAPI and starts it with uvicorn on port 8000', () => {
    const result = detect(fastapi);

    expect(result.framework).toBe('python');
    expect(result.plan?.runtime).toBe('python@3.12');
    expect(result.plan?.port).toBe(8000);
    expect(result.plan?.start).toContain('uvicorn');
    expect(result.plan?.start).toContain('main:app');
  });

  it('detects Django and starts it with gunicorn', () => {
    const result = detect(django);

    expect(result.framework).toBe('python');
    expect(result.plan?.port).toBe(8000);
    expect(result.plan?.start).toBe('gunicorn myproj.wsgi:application');
  });

  it('detects a plain static site with confidence 0.8', () => {
    const result = detect(staticSite);

    expect(result.framework).toBe('static');
    expect(result.plan?.runtime).toBe('static@1');
    expect(result.plan?.port).toBe(80);
    expect(result.confidence).toBe(0.8);
  });

  it('detects a Dockerfile with confidence 0.99 and default port 3000', () => {
    const result = detect(dockerfile);

    expect(result.framework).toBe('docker');
    expect(result.plan?.runtime).toBe('docker@1');
    expect(result.plan?.port).toBe(3000);
    expect(result.confidence).toBe(0.99);
  });

  it('reads the first exposed port from a Dockerfile', () => {
    const result = detect(dockerfileExpose);

    expect(result.framework).toBe('docker');
    expect(result.plan?.port).toBe(8080);
  });

  it('adds a buildArgs entry and a question for ARG without a default', () => {
    const result = detect(dockerfileArgRequired);

    expect(result.plan?.buildArgs).toEqual({ NEXT_PUBLIC_URL: '' });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.id).toBe('buildArg.NEXT_PUBLIC_URL');
    expect(result.questions[0]?.prompt).toContain('NEXT_PUBLIC_URL');
  });

  it('adds a buildArgs entry and skips the question for ARG with a default', () => {
    const result = detect(dockerfileArgDefault);

    expect(result.plan?.buildArgs).toEqual({ NODE_ENV: 'production' });
    expect(result.questions ?? []).toHaveLength(0);
  });

  it('ignores ARG instructions appearing before the first FROM', () => {
    const result = detect(dockerfileArgBeforeFrom);

    // PHP_VERSION (before FROM) is ignored. APP_ENV (after FROM) is kept.
    expect(result.plan?.buildArgs).toEqual({ APP_ENV: 'production' });
    expect(result.plan?.port).toBe(9000);
    // nginx is present, so no php-fpm warning.
    expect(result.warnings.join(' ')).not.toContain('php-fpm');
  });

  it('reads VOLUME instructions', () => {
    const result = detect(dockerfileVolume);

    expect(result.plan?.volumes).toEqual(['/app/data']);
  });

  it('warns when multiple ports are EXPOSEd', () => {
    const result = detect(dockerfileMultiExpose);

    expect(result.plan?.port).toBe(3000);
    expect(result.warnings.join(' ')).toContain('8080');
  });

  it('warns when EXPOSE is 9000 without a web server', () => {
    const result = detect(dockerfilePhpFpm);

    expect(result.plan?.port).toBe(9000);
    expect(result.warnings.join(' ')).toContain('php-fpm');
    expect(result.warnings.join(' ')).toContain('nginx');
  });

  it('honours an explicit eflex.json with confidence 1.0', () => {
    const result = detect(eflexConfig);

    expect(result.framework).toBe('eflex-config');
    expect(result.confidence).toBe(1);
    expect(result.plan?.framework).toBe('nextjs');
    expect(result.plan?.runtime).toBe('node@20');
    expect(result.plan?.port).toBe(4000);
    expect(result.plan?.install).toBe('pnpm install --frozen-lockfile');
    expect(result.plan?.start).toBe('pnpm start');
    expect(result.plan?.healthcheck).toBe('/health');
    expect(result.plan?.buildEnv).toEqual({ PUBLIC_URL: 'https://example.com' });
  });

  it('returns a null plan and a warning for invalid eflex.json', () => {
    const result = detect(eflexConfigInvalid);

    expect(result.plan).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/invalide/i);
  });

  it('asks which app to deploy in a monorepo with two candidates', () => {
    const result = detect(monorepoMultiple);

    expect(result.plan).toBeNull();
    expect(result.confidence).toBe(0.45);
    expect(result.questions[0]?.id).toBe('app');
    expect(result.questions[0]?.options).toEqual(['apps/api', 'apps/web']);
    expect(result.alternatives).toHaveLength(2);
  });

  it('detects the application the user picked in a monorepo with several candidates', () => {
    const result = detectApplication(monorepoMultiple, 'apps/web');

    expect(result.framework).toBe('nextjs');
    expect(result.plan?.root).toBe('apps/web');
    expect(result.plan?.repoRoot).toBe('../..');
    expect(result.reasons[0]).toContain('apps/web');
    expect(result.confidence).toBeLessThan(0.95);
  });

  it('rejects an application path that is not part of the monorepo', () => {
    for (const app of ['apps/ghost', '../etc', '', 'apps']) {
      const result = detectApplication(monorepoMultiple, app);
      expect(result.plan).toBeNull();
    }
  });

  it('resolves a monorepo with a single app and reduces confidence', () => {
    const result = detect(monorepoSingle);

    expect(result.plan?.root).toBe('apps/web');
    expect(result.plan?.repoRoot).toBe('../..');
    expect(result.framework).toBe('nextjs');
    expect(result.confidence).toBeLessThan(0.92);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.plan?.workspace).toEqual({
      manager: 'pnpm',
      name: '@acme/web',
      buildScript: 'build',
    });
  });

  it('expose le paquet du workspace pour un monorepo Turborepo', () => {
    const result = detectApplication(monorepoWorkspace, 'apps/web');

    expect(result.plan?.root).toBe('apps/web');
    expect(result.plan?.workspace).toEqual({
      manager: 'pnpm',
      name: '@acme/web',
      buildScript: 'build',
    });
    // Le paquet partagé n'est pas déployable seul, mais reste une alternative.
    expect(detect(monorepoWorkspace).questions[0]?.options).toContain('packages/ui');
  });

  it('returns a null plan and a stack question for an unknown repository', () => {
    const result = detect(unknownRepo);

    expect(result.plan).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.framework).toBeNull();
    expect(result.questions[0]?.id).toBe('stack');
  });

  it('uses --frozen-lockfile when a pnpm lockfile is present', () => {
    const result = detect(nextjsWithPnpm);

    expect(result.plan?.install).toBe('pnpm install --frozen-lockfile');
  });

  it('utilise --immutable pour Yarn Berry et active Corepack', () => {
    const result = detect(nextjsWithYarnBerry);

    expect(result.plan?.install).toBe('corepack enable && yarn install --immutable');
  });

  it('utilise bun install quand le dépôt déclare Bun', () => {
    const result = detect(nextjsWithBun);

    expect(result.plan?.install).toBe('bun install --frozen-lockfile');
    expect(result.plan?.packageManager).toBe('bun');
    expect(result.plan?.packageManagerVersion).toBe('1.1.0');
    expect(result.reasons.join(' ')).toContain('Version de Bun détectée');
  });

  it('détecte un lockfile Bun texte récent et avertit sur la compatibilité du builder', () => {
    const result = detect(nextjsWithBunLockV2);

    expect(result.plan?.install).toBe('bun install --frozen-lockfile');
    expect(result.plan?.packageManager).toBe('bun');
    expect(result.plan?.packageManagerVersion).toBe('1.3.0');
    expect(result.reasons.join(' ')).toContain('Format du lockfile Bun détecté');
    expect(result.warnings.join(' ')).toContain('lockfileVersion');
  });

  it('n’impose pas --frozen-lockfile quand pnpm est déclaré sans lockfile', () => {
    const result = detect(nextjsWithDeclaredPnpm);

    expect(result.plan?.install).toBe('corepack enable && pnpm install');
  });

  it('ajoute --ignore-workspace quand pnpm-workspace.yaml n’a pas de champ packages', () => {
    const result = detect(nextjsWithPnpmSettingsOnly);

    expect(result.plan?.install).toBe('pnpm install --frozen-lockfile --ignore-workspace');
  });

  it('utilise npm install (et non npm ci) sans lockfile', () => {
    const result = detect(nextjs);

    expect(result.plan?.install).toBe('npm install');
  });

  it('derives node@20 from engines.node ">=20"', () => {
    const result = detect(nextjsWithEngines);

    expect(result.plan?.runtime).toBe('node@20');
  });

  it('always clamps confidence between 0 and 0.99 (except explicit eflex.json)', () => {
    for (const fixture of allFixtures()) {
      const result = detect(fixture.snapshot);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      if (result.framework !== 'eflex-config') {
        expect(result.confidence).toBeLessThanOrEqual(0.99);
      }
    }

    expect(scoreConfidence(5)).toBe(0.99);
    expect(scoreConfidence(-5)).toBe(0);
  });
});
