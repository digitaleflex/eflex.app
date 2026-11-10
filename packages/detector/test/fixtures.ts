import type { RepoSnapshot } from '../src/types.js';

export function makeSnapshot(files: Record<string, string>): RepoSnapshot {
  return {
    files: Object.keys(files),
    read: (path: string): string | null =>
      Object.prototype.hasOwnProperty.call(files, path) ? files[path] ?? null : null,
  };
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

export const nextjs = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0', react: '18.3.0' },
  }),
  'next.config.js': 'module.exports = {};\n',
  'app/page.tsx': 'export default function Page() { return null; }\n',
});

export const nextjsWithPnpm = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
  }),
  'next.config.js': 'module.exports = {};\n',
  'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n',
});

/** Yarn Berry : lockfile avec métadonnées et version déclarée via Corepack. */
export const nextjsWithYarnBerry = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
    packageManager: 'yarn@4.5.0',
  }),
  'next.config.js': 'module.exports = {};\n',
  'yarn.lock': '__metadata:\n  version: 8\n  cacheKey: 10c0\n',
  '.yarnrc.yml': 'nodeLinker: node-modules\n',
});

/** Bun : lockfile binaire reconnu par Nixpacks. */
export const nextjsWithBun = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
    packageManager: 'bun@1.1.0',
  }),
  'next.config.js': 'module.exports = {};\n',
  'bun.lockb': 'binary-placeholder\n',
});

/** pnpm déclaré sans lockfile : installation sans --frozen-lockfile. */
export const nextjsWithDeclaredPnpm = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
    packageManager: 'pnpm@9.12.0',
  }),
  'next.config.js': 'module.exports = {};\n',
});

/** pnpm-workspace.yaml utilisé pour des réglages, sans champ `packages`. */
export const nextjsWithPnpmSettingsOnly = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
  }),
  'next.config.js': 'module.exports = {};\n',
  'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n',
  'pnpm-workspace.yaml': "ignoredBuiltDependencies:\n  - '@tailwindcss/oxide'\n",
});

export const nextjsWithEngines = makeSnapshot({
  'package.json': json({
    name: 'next-app',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
    engines: { node: '>=20' },
  }),
  'next.config.js': 'module.exports = {};\n',
});

export const vite = makeSnapshot({
  'package.json': json({
    name: 'vite-app',
    scripts: { build: 'vite build' },
    devDependencies: { vite: '^5.0.0' },
  }),
  'index.html': '<div id="root"></div>\n',
  'vite.config.ts': 'export default {};\n',
});

export const astro = makeSnapshot({
  'package.json': json({
    name: 'astro-app',
    scripts: { build: 'astro build' },
    dependencies: { astro: '^4.0.0' },
  }),
  'src/pages/index.astro': '<h1>Astro</h1>\n',
});

export const nuxt = makeSnapshot({
  'package.json': json({
    name: 'nuxt-app',
    scripts: { build: 'nuxt build', start: 'nuxt start' },
    dependencies: { nuxt: '^3.5.0' },
  }),
  'nuxt.config.ts': 'export default defineNuxtConfig({}),\n',
  'pages/index.vue': '<template><div>Hello</div></template>\n',
});

export const remix = makeSnapshot({
  'package.json': json({
    name: 'remix-app',
    scripts: { build: 'remix build', start: 'remix start' },
    dependencies: { remix: '^4.0.0' },
  }),
  'remix.config.js': 'export default {\n  server: {\n    freshModes: { ssr: [], app: [], dom: [] },\n  },\n},\n',
  'app/routes/home.tsx': '<h1>Home</h1>\n',
});

export const solidstart = makeSnapshot({
  'package.json': json({
    name: 'solidstart-app',
    scripts: { build: 'solid-build', start: 'solid start' },
    dependencies: { 'solid-start': '^1.0.0' },
  }),
  'solid.config.ts': 'export default {\n  htmlOutput: true,\n},\n',
  'pages/index.tsx': '<h1>Hello</h1>\n',
});

export const redwoodjs = makeSnapshot({
  'package.json': json({
    name: 'redwoodjs-app',
    scripts: { build: 'redwood build', start: 'redwood serve' },
    dependencies: {
      '@redwoodjs/api': '^1.0.0',
      '@redwoodjs/db': '^1.0.0',
    },
  }),
  '@redwoodjs/api/index.ts': 'export function home() {\n  return {\n    data: "Hello",\n  };\n}\n',
});

export const svelte = makeSnapshot({
  'package.json': json({
    name: 'svelte-app',
    scripts: { build: 'svelte build' },
    dependencies: { svelte: '^4.0.0' },
  }),
  'src/app.svelte': '<h1>Svelte</h1>\n',
});

export const express = makeSnapshot({
  'package.json': json({
    name: 'express-app',
    scripts: { start: 'node server.js' },
    dependencies: { express: '^4.19.0' },
  }),
  'server.js': 'const app = require("express")();\n',
});

export const laravelFull = makeSnapshot({
  'artisan': '#!/usr/bin/env php\n<?php\n',
  'composer.json': json({
    require: {
      php: '^8.3',
      'laravel/framework': '^11.0',
    },
  }),
  'public/index.php': '<?php\n',
  'package.json': json({
    scripts: { build: 'vite build' },
  }),
  'app/Jobs/SendWelcomeEmail.php': '<?php\n',
  'routes/console.php': '<?php\n',
});

/** Projet Laravel réel : Vite et laravel-vite-plugin compilent les assets front. */
export const laravelVite = makeSnapshot({
  'artisan': '#!/usr/bin/env php\n<?php\n',
  'composer.json': json({
    require: {
      php: '^8.3',
      'laravel/framework': '^11.0',
    },
  }),
  'composer.lock': '{}',
  'public/index.php': '<?php\n',
  'package.json': json({
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    devDependencies: {
      vite: '^5.0.0',
      'laravel-vite-plugin': '^1.0.0',
    },
  }),
  'package-lock.json': '{}',
  'vite.config.js': 'export default {};\n',
  'resources/js/app.js': '',
  'routes/console.php': '<?php\n',
});

export const laravelMinimal = makeSnapshot({
  'artisan': '#!/usr/bin/env php\n<?php\n',
  'composer.json': json({
    require: {
      php: '^8.3',
      'laravel/framework': '^11.0',
    },
  }),
  'public/index.php': '<?php\n',
});

export const phpGeneric = makeSnapshot({
  'index.php': '<?php echo "ok";\n',
});

export const fastapi = makeSnapshot({
  'requirements.txt': 'fastapi==0.115.0\nuvicorn[standard]==0.30.0\n',
  'main.py': 'from fastapi import FastAPI\n\napp = FastAPI()\n',
});

export const django = makeSnapshot({
  'manage.py': '#!/usr/bin/env python\n',
  'requirements.txt': 'django==5.0.0\n',
  'myproj/wsgi.py': 'application = None\n',
  'myproj/settings.py': 'DEBUG = True\n',
});

export const staticSite = makeSnapshot({
  'index.html': '<!doctype html><h1>Bonjour</h1>\n',
});

/** package.json avec un script build et un index.html, sans framework reconnu. */
export const staticSiteWithBuild = makeSnapshot({
  'index.html': '<!doctype html><div id="app"></div>\n',
  'package.json': json({ scripts: { build: 'webpack --mode production' } }),
  'package-lock.json': '{}',
});

export const dockerfile = makeSnapshot({
  'Dockerfile': 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\n',
});

export const dockerfileExpose = makeSnapshot({
  'Dockerfile': 'FROM nginx:alpine\nEXPOSE 8080\nCOPY . /usr/share/nginx/html\n',
});

export const eflexConfig = makeSnapshot({
  'eflex.json': json({
    version: 1,
    framework: 'nextjs',
    runtime: 'node@20',
    root: '',
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm build',
    start: 'pnpm start',
    port: 4000,
    healthcheck: '/health',
    buildEnv: {
      PUBLIC_URL: 'https://example.com',
    },
  }),
});

export const eflexConfigStatic = makeSnapshot({
  'eflex.json': json({
    version: 1,
    framework: 'vite',
    runtime: 'static@1',
    build: 'npm run build',
    publish: 'out/site',
    port: 80,
  }),
});

/** Chemins piégés : ils doivent être ignorés plutôt que transmis au déploiement. */
export const eflexConfigUnsafePaths = makeSnapshot({
  'eflex.json': json({
    version: 1,
    framework: 'docker',
    runtime: 'docker@1',
    publish: '../../etc',
    dockerfile: '../Dockerfile',
    port: 3000,
  }),
});

export const dockerfileInSubdir = makeSnapshot({
  'docker/Dockerfile': 'FROM node:22-alpine\nWORKDIR /app\nEXPOSE 8080\nCOPY . .\n',
});

export const eflexConfigInvalid = makeSnapshot({
  'eflex.json': '{ "version": 1, "framework": ',
});

export const monorepoMultiple = makeSnapshot({
  'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
  'apps/web/package.json': json({
    name: 'web',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
  }),
  'apps/api/package.json': json({
    name: 'api',
    scripts: { start: 'node server.js' },
    dependencies: { express: '^4.19.0' },
  }),
  'apps/api/server.js': 'console.log("api");\n',
});

export const monorepoSingle = makeSnapshot({
  'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
  'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n',
  'apps/web/package.json': json({
    name: '@acme/web',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
  }),
});

/** Monorepo pnpm avec Turborepo et une dépendance interne au workspace. */
export const monorepoWorkspace = makeSnapshot({
  'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "packages/*"\n',
  'turbo.json': json({ pipeline: { build: { dependsOn: ['^build'] } } }),
  'package.json': json({ name: 'acme', private: true, packageManager: 'pnpm@9.12.0' }),
  'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n',
  'apps/web/package.json': json({
    name: '@acme/web',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0', '@acme/ui': 'workspace:*' },
  }),
  'apps/web/next.config.js': 'module.exports = {};\n',
  'packages/ui/package.json': json({
    name: '@acme/ui',
    scripts: { build: 'tsc -p tsconfig.json' },
    devDependencies: { typescript: '^5.6.0' },
  }),
  'packages/ui/src/index.ts': 'export const Button = (): string => "ok";\n',
});

export const dockerfileArgRequired = makeSnapshot({
  'Dockerfile': 'FROM node:22-alpine\nWORKDIR /app\nARG NEXT_PUBLIC_URL\nEXPOSE 3000\nCOPY . .\n',
});

export const dockerfileArgDefault = makeSnapshot({
  'Dockerfile': 'FROM node:22-alpine\nWORKDIR /app\nARG NODE_ENV=production\nEXPOSE 3000\nCOPY . .\n',
});

export const dockerfileArgBeforeFrom = makeSnapshot({
  'Dockerfile': 'ARG PHP_VERSION=8.3\nFROM php:${PHP_VERSION}-fpm\nWORKDIR /app\nARG APP_ENV=production\nEXPOSE 9000\nCOPY . .\nRUN apt-get update && apt-get install -y nginx\n',
});

export const dockerfileVolume = makeSnapshot({
  'Dockerfile': 'FROM node:22-alpine\nWORKDIR /app\nVOLUME ["/app/data"]\nEXPOSE 3000\nCOPY . .\n',
});

export const dockerfileMultiExpose = makeSnapshot({
  'Dockerfile': 'FROM node:22-alpine\nEXPOSE 3000\nEXPOSE 8080\nCOPY . .\n',
});

export const dockerfilePhpFpm = makeSnapshot({
  'Dockerfile': 'FROM php:8.3-fpm\nWORKDIR /app\nEXPOSE 9000\nCOPY . .\n',
});

export const unknownRepo = makeSnapshot({
  'README.md': '# Projet inconnu\n',
});

export interface Fixture {
  name: string;
  snapshot: RepoSnapshot;
}

export function allFixtures(): Fixture[] {
  return [
    { name: 'nextjs', snapshot: nextjs },
    { name: 'nextjs-with-pnpm', snapshot: nextjsWithPnpm },
    { name: 'nextjs-with-yarn-berry', snapshot: nextjsWithYarnBerry },
    { name: 'nextjs-with-bun', snapshot: nextjsWithBun },
    { name: 'nextjs-with-declared-pnpm', snapshot: nextjsWithDeclaredPnpm },
    { name: 'nextjs-with-pnpm-settings-only', snapshot: nextjsWithPnpmSettingsOnly },
    { name: 'nextjs-with-engines', snapshot: nextjsWithEngines },
    { name: 'vite', snapshot: vite },
    { name: 'astro', snapshot: astro },
    { name: 'nuxt', snapshot: nuxt },
    { name: 'remix', snapshot: remix },
    { name: 'solidstart', snapshot: solidstart },
    { name: 'redwoodjs', snapshot: redwoodjs },
    { name: 'svelte', snapshot: svelte },
    { name: 'express', snapshot: express },
    { name: 'laravel-full', snapshot: laravelFull },
    { name: 'laravel-vite', snapshot: laravelVite },
    { name: 'laravel-minimal', snapshot: laravelMinimal },
    { name: 'php-generic', snapshot: phpGeneric },
    { name: 'fastapi', snapshot: fastapi },
    { name: 'django', snapshot: django },
    { name: 'static', snapshot: staticSite },
    { name: 'static-with-build', snapshot: staticSiteWithBuild },
    { name: 'dockerfile', snapshot: dockerfile },
    { name: 'dockerfile-expose', snapshot: dockerfileExpose },
    { name: 'eflex-config', snapshot: eflexConfig },
    { name: 'eflex-config-static', snapshot: eflexConfigStatic },
    { name: 'eflex-config-unsafe-paths', snapshot: eflexConfigUnsafePaths },
    { name: 'dockerfile-in-subdir', snapshot: dockerfileInSubdir },
    { name: 'dockerfile-arg-required', snapshot: dockerfileArgRequired },
    { name: 'dockerfile-arg-default', snapshot: dockerfileArgDefault },
    { name: 'dockerfile-arg-before-from', snapshot: dockerfileArgBeforeFrom },
    { name: 'dockerfile-volume', snapshot: dockerfileVolume },
    { name: 'dockerfile-multi-expose', snapshot: dockerfileMultiExpose },
    { name: 'dockerfile-php-fpm', snapshot: dockerfilePhpFpm },
    { name: 'eflex-config-invalid', snapshot: eflexConfigInvalid },
    { name: 'monorepo-multiple', snapshot: monorepoMultiple },
    { name: 'monorepo-single', snapshot: monorepoSingle },
    { name: 'monorepo-workspace', snapshot: monorepoWorkspace },
    { name: 'unknown', snapshot: unknownRepo },
  ];
}
