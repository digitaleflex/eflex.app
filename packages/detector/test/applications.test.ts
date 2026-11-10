import { describe, expect, it } from 'vitest';
import { detectApplications, normalizeApplicationName } from '../src/index.js';
import {
  composeMonorepoApp,
  composeRoot,
  monorepoDeepApp,
  monorepoDuplicateNames,
  monorepoMultiple,
  monorepoNodeModulesNoise,
  monorepoNx,
  monorepoSingle,
  monorepoWorkspace,
  nextjs,
  staticSite,
  unknownRepo,
} from './fixtures.js';

const summary = (apps: ReturnType<typeof detectApplications>) =>
  apps.map(({ root, name, framework }) => ({ root, name, framework }));

describe('detectApplications', () => {
  it('renvoie une seule application pour un dépôt mono-application', () => {
    const apps = detectApplications(nextjs);

    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      root: '',
      name: 'next-app',
      framework: 'nextjs',
      confidence: expect.any(Number),
    });
    expect(apps[0]?.plan?.framework).toBe('nextjs');
  });

  it('nomme l’application racine avec le nom du dépôt en repli', () => {
    const apps = detectApplications(staticSite, { rootName: 'Boutique Acme' });

    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ root: '', name: 'boutique-acme', framework: 'static' });
  });

  it('ne renvoie rien quand aucun manifeste n’est reconnu', () => {
    expect(detectApplications(unknownRepo)).toEqual([]);
  });

  it('liste les applications pnpm dans l’ordre racine puis alphabétique', () => {
    const apps = detectApplications(monorepoMultiple);

    expect(summary(apps)).toEqual([
      { root: 'apps/api', name: 'api', framework: 'node' },
      { root: 'apps/web', name: 'web', framework: 'nextjs' },
    ]);
    expect(apps[0]?.plan?.root).toBe('apps/api');
    expect(apps[0]?.plan?.repoRoot).toBe('../..');
  });

  it('liste les trois applications d’un monorepo Nx', () => {
    const apps = detectApplications(monorepoNx);

    expect(summary(apps)).toEqual([
      { root: 'apps/admin', name: 'admin', framework: 'vite' },
      { root: 'apps/api', name: 'api', framework: 'node' },
      { root: 'apps/web', name: 'web', framework: 'nextjs' },
    ]);
    expect(apps.map((app) => app.plan?.workspace?.manager)).toEqual(['npm', 'npm', 'npm']);
  });

  it('écarte les paquets de bibliothèque et les paquets racine non déployables', () => {
    const apps = detectApplications(monorepoWorkspace);

    // `@acme/ui` (build seul) et le `package.json` privé de la racine ne sont pas des applications.
    expect(summary(apps)).toEqual([{ root: 'apps/web', name: 'web', framework: 'nextjs' }]);
  });

  it('résout un monorepo à application unique (pnpm) et conserve le workspace', () => {
    const apps = detectApplications(monorepoSingle);

    expect(summary(apps)).toEqual([{ root: 'apps/web', name: 'web', framework: 'nextjs' }]);
    expect(apps[0]?.plan?.workspace).toEqual({
      manager: 'pnpm',
      name: '@acme/web',
      buildScript: 'build',
    });
  });

  it('résout une application compose placée dans un monorepo', () => {
    const apps = detectApplications(composeMonorepoApp);

    expect(summary(apps)).toEqual([{ root: 'apps/api', name: 'api', framework: 'compose' }]);
    expect(apps[0]?.plan?.compose?.location).toBe('/compose.yml');
  });

  it('déduplique les noms et retire le scope npm', () => {
    const apps = detectApplications(monorepoDuplicateNames);

    expect(apps.map((app) => app.name)).toEqual(['web', 'web-2', 'web-admin']);
    expect(apps.map((app) => app.root)).toEqual(['apps/alpha', 'apps/beta', 'apps/gamma']);
  });

  it('ignore les dossiers au-delà de la profondeur 3', () => {
    const apps = detectApplications(monorepoDeepApp);

    expect(summary(apps)).toEqual([{ root: 'apps/ok', name: 'ok', framework: 'nextjs' }]);

    // L'option permet d'aller plus loin sans changer le défaut.
    expect(detectApplications(monorepoDeepApp, { maxDepth: 4 }).map((app) => app.root)).toEqual([
      'apps/ok',
      'apps/one/two/three',
    ]);
  });

  it('ignore node_modules, .next et dist (aucun faux positif)', () => {
    const apps = detectApplications(monorepoNodeModulesNoise);

    expect(summary(apps)).toEqual([{ root: 'apps/real', name: 'real', framework: 'nextjs' }]);
  });

  it('respecte la précédence d’un compose racine (une application)', () => {
    const apps = detectApplications(composeRoot);

    expect(apps).toHaveLength(1);
    expect(apps[0]?.root).toBe('');
    expect(apps[0]?.framework).toBe('compose');
  });

  it('reste déterministe sur deux appels successifs', () => {
    expect(detectApplications(monorepoNx)).toEqual(detectApplications(monorepoNx));
  });

  it('reste déterministe quel que soit l’ordre des fichiers du snapshot', () => {
    const reversed = {
      files: [...monorepoNx.files].reverse(),
      read: (path: string) => monorepoNx.read(path),
    };

    expect(detectApplications(reversed)).toEqual(detectApplications(monorepoNx));
  });
});

describe('normalizeApplicationName', () => {
  it('normalise scopes, accents, casse et caractères spéciaux', () => {
    expect(normalizeApplicationName('@acme/web')).toBe('web');
    expect(normalizeApplicationName('Web Admin')).toBe('web-admin');
    expect(normalizeApplicationName('Café déjà')).toBe('cafe-deja');
    expect(normalizeApplicationName('a'.repeat(40))).toHaveLength(24);
    expect(normalizeApplicationName('!!!')).toBe('');
  });
});
