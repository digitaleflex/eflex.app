import type { BuildPlan } from '../../detector/src/types.js';
import { RenderError } from './errors.js';

/**
 * BuildPlan → Dockerfile déterministe (issue 02).
 * Retourne `null` pour `framework === 'docker'` : c'est le Dockerfile du dépôt
 * qui fait foi, Eflex n'en génère pas.
 *
 * Aucun secret n'est écrit : seules les valeurs publiques `buildEnv` /
 * `buildArgs` (validées) peuvent apparaître, et jamais les variables runtime.
 */
const SAFE = /^[^\r\n]*$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function safe(value: string, label: string): string {
  if (!SAFE.test(value)) {
    throw new RenderError(`${label} contient un saut de ligne ou un caractère de contrôle.`);
  }
  return value;
}

function runtimeVersion(runtime: string, prefix: string, fallback: string): string {
  if (!runtime.startsWith(prefix)) return fallback;
  const value = runtime.slice(prefix.length).trim();
  return /^[A-Za-z0-9._-]+$/.test(value) ? safe(value, 'runtime') : fallback;
}

function baseImage(plan: BuildPlan): string {
  const r = plan.runtime || '';
  if (r.startsWith('node@')) return `node:${runtimeVersion(r, 'node@', '22')}-alpine`;
  if (r.startsWith('php@')) return `php:${runtimeVersion(r, 'php@', '8.3')}-fpm-alpine`;
  if (r.startsWith('python@')) return `python:${runtimeVersion(r, 'python@', '3.12')}-slim`;
  return 'node:22-alpine';
}

const STATIC_FRAMEWORKS = new Set(['static', 'vite', 'svelte', 'astro']);

function publicEnvLines(plan: BuildPlan): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(plan.buildArgs ?? {})) {
    if (!ENV_KEY.test(key)) throw new RenderError(`Nom de buildArg invalide : "${key}".`);
    safe(value, `buildArg ${key}`);
    lines.push(`ARG ${key}=${value}`);
  }
  for (const [key, value] of Object.entries(plan.buildEnv ?? {})) {
    if (!ENV_KEY.test(key)) throw new RenderError(`Nom de buildEnv invalide : "${key}".`);
    safe(value, `buildEnv ${key}`);
    lines.push(`ENV ${key}=${value}`);
  }
  return lines;
}

function shell(command: string | undefined, keyword: 'RUN' | 'CMD'): string | null {
  if (!command) return null;
  return `${keyword} ${safe(command, keyword)}`;
}

export function generateDockerfile(plan: BuildPlan): string | null {
  if (plan.framework === 'docker') return null;

  const lines: string[] = [
    '# Généré par @eflex/renderer à partir du BuildPlan — ne pas modifier.',
    '# Détection → plan → Dockerfile / compose → déploiement.',
  ];

  if (STATIC_FRAMEWORKS.has(plan.framework)) {
    lines.push('FROM node:22-alpine AS assets');
    lines.push('WORKDIR /app');
    lines.push('COPY . .');
    const install = shell(plan.install, 'RUN');
    const build = shell(plan.build, 'RUN');
    if (install) lines.push(install);
    if (build) lines.push(build);
    lines.push('');
    lines.push('FROM nginx:1.27-alpine');
    // Sans build, ce sont les fichiers du dépôt qui sont publiés tels quels.
    const publishDir = plan.build ? 'dist' : '.';
    lines.push(`COPY --from=assets /app/${publishDir} /usr/share/nginx/html`);
    lines.push('EXPOSE 80');
    lines.push('');
    return lines.join('\n') + '\n';
  }

  const php = plan.framework === 'laravel' || plan.framework === 'php' || plan.runtime.startsWith('php@');
  const hasJsBuild = Boolean(plan.build && (php || STATIC_FRAMEWORKS.has(plan.framework)));

  if (hasJsBuild) {
    lines.push('FROM node:22-alpine AS assets');
    lines.push('WORKDIR /app');
    lines.push('COPY . .');
    const build = shell(plan.build, 'RUN');
    if (build) lines.push(build);
    lines.push('');
  }

  lines.push(`FROM ${baseImage(plan)}`);
  lines.push(...publicEnvLines(plan));
  lines.push(`WORKDIR ${php ? '/var/www/html' : '/app'}`);
  lines.push('COPY . .');
  if (hasJsBuild) {
    lines.push('COPY --from=assets /app/public /var/www/html/public');
  }
  const install = shell(plan.install, 'RUN');
  if (install) lines.push(install);
  lines.push(`EXPOSE ${plan.port}`);
  const start = shell(plan.start, 'CMD');
  if (start) lines.push(start);
  lines.push('');

  return lines.join('\n') + '\n';
}
