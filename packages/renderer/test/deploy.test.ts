import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { detect } from '@eflex/detector';
import {
  allFixtures,
  dockerfile,
  fastapi,
  laravelFull,
  staticSite,
  vite,
} from '../../detector/test/fixtures.js';
import {
  buildDeploymentArtifacts,
  generateDockerfile,
  type BuildPlan,
} from '../src/index.js';

function planOf(fixture: Parameters<typeof detect>[0]): BuildPlan | null {
  return detect(fixture).plan;
}

describe('generateDockerfile — toutes les fixtures', () => {
  it('produit un Dockerfile déterministe ou null pour docker', () => {
    for (const fixture of allFixtures()) {
      const plan = planOf(fixture.snapshot);
      if (!plan) continue; // dépôts sans plan (inconnu, eflex.json invalide, monorepo ambigu)

      const result = generateDockerfile(plan);
      if (plan.framework === 'docker') {
        expect(result, fixture.name).toBeNull();
        continue;
      }

      expect(result, fixture.name).toBeTruthy();
      expect(result, fixture.name).toContain('FROM ');
      expect(result, fixture.name).toContain('EXPOSE ');
      expect(result, fixture.name).not.toMatch(/\r/);
      // Aucun secret ne doit jamais apparaître dans un artefact de build.
      expect(result, fixture.name).not.toMatch(/supersecret|api[_-]?key\s*=/i);
      // Déterminisme.
      expect(generateDockerfile(plan), fixture.name).toBe(result);
    }
  });

  it('utilise la version du runtime et les commandes du plan', () => {
    const python = planOf(fastapi)!;
    const out = generateDockerfile(python)!;
    expect(out).toContain('FROM python:3.12-slim');
    expect(out).toContain('RUN pip install -r requirements.txt');
    expect(out).toContain('EXPOSE 8000');
    expect(out).toContain('CMD uvicorn main:app --host 0.0.0.0 --port 8000');
  });

  it('génère un build multi-étapes pour un site statique avec build', () => {
    const out = generateDockerfile(planOf(vite)!)!;
    expect(out).toContain('FROM node:22-alpine AS assets');
    expect(out).toContain('RUN npm ci');
    expect(out).toContain('RUN npm run build');
    expect(out).toContain('FROM nginx:1.27-alpine');
    expect(out).toContain('COPY --from=assets /app/dist /usr/share/nginx/html');
    expect(out).toContain('EXPOSE 80');
  });

  it('génère les étapes assets + php-fpm pour Laravel', () => {
    const out = generateDockerfile(planOf(laravelFull)!)!;
    expect(out).toContain('FROM node:22-alpine AS assets');
    expect(out).toContain('FROM php:8.3-fpm-alpine');
    expect(out).toContain('RUN composer install --no-dev --optimize-autoloader');
    expect(out).toContain('COPY --from=assets /app/public /var/www/html/public');
  });
});

describe('buildDeploymentArtifacts', () => {
  it('Laravel : app, web, queue, scheduler + service one-shot migrate', () => {
    const plan = planOf(laravelFull)!;
    const artifacts = buildDeploymentArtifacts(plan, { projectId: 'test-proj' });
    const doc = YAML.parse(artifacts.compose) as Record<string, Record<string, Record<string, unknown>>>;
    const services = Object.keys(doc.services);

    expect(services).toContain('app');
    expect(services).toContain('web');
    expect(services).toContain('queue');
    expect(services).toContain('scheduler');
    expect(services).toContain('migrate');
    expect(String(doc.services.migrate.command)).toContain('php artisan migrate --force');
    expect(doc.services.migrate.restart).toBe('no');
    expect(artifacts.buildPack).toBe('dockercompose');
    expect(artifacts.files['Dockerfile']).toBeTruthy();
    expect(artifacts.files['nginx/default.conf']).toBeTruthy();
  });

  it('Python : exposé sur le port réel 8000', () => {
    const artifacts = buildDeploymentArtifacts(planOf(fastapi)!, { projectId: 'py-proj' });
    expect(artifacts.portsExposes).toBe(8000);
    expect(artifacts.buildPack).toBe('dockercompose');
    expect(artifacts.postDeploy).toEqual([]);
  });

  it('Site statique : exposé sur le port 80, service web', () => {
    const artifacts = buildDeploymentArtifacts(planOf(staticSite)!, { projectId: 'site-proj' });
    expect(artifacts.portsExposes).toBe(80);
    expect(artifacts.services).toContain('web');
    expect(artifacts.buildPack).toBe('dockercompose');
  });

  it('framework docker : build pack dockerfile, aucun Dockerfile généré', () => {
    const artifacts = buildDeploymentArtifacts(planOf(dockerfile)!, { projectId: 'dock-proj' });
    expect(artifacts.buildPack).toBe('dockerfile');
    expect(artifacts.dockerfile).toBeNull();
    expect(artifacts.compose).toBe('');
    expect(artifacts.portsExposes).toBe(3000);
  });

  it('aucun artefact ne contient nixpacks', () => {
    for (const fixture of allFixtures()) {
      const plan = planOf(fixture.snapshot);
      if (!plan) continue;
      const artifacts = buildDeploymentArtifacts(plan, { projectId: 'test-proj' });
      expect(`${artifacts.compose}${artifacts.dockerfile ?? ''}`, fixture.name).not.toMatch(/nixpacks/i);
    }
  });

  it('les services du plan utilisent le contexte de build du dépôt', () => {
    const artifacts = buildDeploymentArtifacts(planOf(fastapi)!, { projectId: 'py-proj' });
    const doc = YAML.parse(artifacts.compose) as Record<string, Record<string, Record<string, unknown>>>;
    expect(doc.services.app.build).toEqual({ context: '.', dockerfile: 'Dockerfile' });
  });
});
