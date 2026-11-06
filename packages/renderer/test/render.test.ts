import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { renderStack, RenderError } from '../src/index.js';
import type { BuildPlan, RenderContext, RenderedStack } from '../src/types.js';

const baseCtx: RenderContext = {
  projectId: 'test-proj',
  image: 'ghcr.io/eflex/app:sha256-abc',
};

const baseTraefik = { entrypoint: 'websecure', certResolver: 'letsencrypt' } as const;

function render(plan: BuildPlan, overrides?: Partial<RenderContext>): RenderedStack {
  return renderStack(plan, { ...baseCtx, ...overrides });
}

function secretsForbidden(yaml: string): void {
  // The compose YAML must never contain secret values in plain text.
  expect(yaml).not.toMatch(/supersecret|api_key/);
}

describe('renderStack', () => {
  // --- Framework: docker ---
  it('renders a single app service for docker', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'docker', runtime: 'docker@1', root: '', port: 3000,
    };
    const result = render(plan);
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    expect(doc.name).toBe('eflex-test-proj');
    expect(Object.keys(doc.services as object)).toEqual(['app']);
    const app = (doc.services as Record<string, Record<string, unknown>>)['app'];
    expect(app?.image).toBe('ghcr.io/eflex/app:sha256-abc');
    expect(app?.expose).toEqual([3000]);
    expect(result.metadata.services).toEqual(['app']);
    expect(result.metadata.ports).toEqual({ app: 3000 });
  });

  it('omits Traefik labels when no domain is set', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'docker', runtime: 'docker@1', root: '', port: 8080,
    };
    const result = render(plan);
    expect(result.compose).not.toContain('traefik');
  });

  it('adds Traefik labels when a domain is set', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'docker', runtime: 'docker@1', root: '', port: 3000,
    };
    const result = render(plan, { domain: 'app.example.com', traefik: baseTraefik });
    expect(result.compose).toContain('traefik.enable=true');
    expect(result.compose).toContain('Host(`app.example.com`)');
    expect(result.compose).toContain('loadbalancer.server.port=3000');
  });

  // --- Framework: laravel ---
  it('renders 4 services for a full Laravel plan', () => {
    const plan: BuildPlan = {
      version: 1,
      framework: 'laravel',
      runtime: 'php@8.3',
      root: '',
      port: 80,
      services: {
        app: { command: 'php-fpm', port: 9000 },
        web: { command: "nginx -g 'daemon off;'", port: 80, healthcheck: '/' },
        queue: { command: 'php artisan queue:work', replicas: 1 },
        scheduler: { command: 'php artisan schedule:work' },
      },
      volumes: ['storage'],
      postDeploy: ['php artisan migrate --force'],
    };
    const result = render(plan, { domain: 'laravel.example.com', traefik: baseTraefik });
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    const services = Object.keys(doc.services as object);
    expect(services).toContain('app');
    expect(services).toContain('web');
    expect(services).toContain('queue');
    expect(services).toContain('scheduler');
    expect(result.metadata.services).toHaveLength(4);
    expect(result.files['nginx/default.conf']).toContain('fastcgi_pass app:9000');
    expect(result.compose).toContain('depends_on');
  });

  it('renders 2 services for a minimal Laravel plan', () => {
    const plan: BuildPlan = {
      version: 1,
      framework: 'laravel',
      runtime: 'php@8.3',
      root: '',
      port: 80,
      services: {
        app: { command: 'php-fpm', port: 9000 },
        web: { command: "nginx -g 'daemon off;'", port: 80, healthcheck: '/' },
      },
    };
    const result = render(plan, { domain: 'min.example.com', traefik: baseTraefik });
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    const services = Object.keys(doc.services as object);
    expect(services).toEqual(expect.arrayContaining(['app', 'web']));
    expect(services).not.toContain('queue');
    expect(services).not.toContain('scheduler');
  });

  // --- Framework: nextjs ---
  it('renders Next.js on port 3000', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'nextjs', runtime: 'node@22', root: '', port: 3000,
      start: 'node server.js',
    };
    const result = render(plan, { domain: 'next.example.com', traefik: baseTraefik });
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    const services = Object.keys(doc.services as object);
    expect(services).toEqual(['app']);
    expect(result.metadata.ports).toEqual({ app: 3000 });
  });

  // --- Framework: static ---
  it('renders nginx for static sites on port 80', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'static', runtime: 'static@1', root: '', port: 80,
    };
    const result = render(plan);
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    const services = Object.keys(doc.services as object);
    expect(services).toEqual(['web']);
    const web = (doc.services as Record<string, Record<string, unknown>>)['web'];
    expect(web?.image).toBe('nginx:1.27-alpine');
    expect(result.metadata.ports).toEqual({ web: 80 });
  });

  // --- Framework: python ---
  it('renders Python on port 8000', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'python', runtime: 'python@3.12', root: '', port: 8000,
      start: 'uvicorn main:app --host 0.0.0.0 --port 8000',
    };
    const result = render(plan);
    expect(result.metadata.ports).toEqual({ app: 8000 });
  });

  // --- resources ---
  it('applies deploy.resources.limits', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'node', runtime: 'node@22', root: '', port: 3000,
    };
    const result = render(plan, { resources: { cpu: 0.5, memoryMb: 256 } });
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    const app = (doc.services as Record<string, Record<string, unknown>>)['app'];
    const limits = (app?.deploy as Record<string, Record<string, string>>)?.resources?.limits;
    expect(limits?.cpus).toBe('0.5');
    expect(limits?.memory).toBe('256M');
  });

  // --- logging ---
  it('sets json-file logging on all services', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'nextjs', runtime: 'node@22', root: '', port: 3000,
    };
    const result = render(plan);
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    for (const svc of Object.values(doc.services as Record<string, Record<string, unknown>>)) {
      expect(svc.logging).toBeDefined();
      expect((svc.logging as Record<string, unknown>).driver).toBe('json-file');
      expect((svc.logging as Record<string, { 'max-size': string }>).options?.['max-size']).toBe('10m');
    }
  });

  // --- restart policy ---
  it('sets unless-stopped on all services', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'docker', runtime: 'docker@1', root: '', port: 3000,
    };
    const result = render(plan);
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    for (const svc of Object.values(doc.services as Record<string, Record<string, unknown>>)) {
      expect(svc.restart).toBe('unless-stopped');
    }
  });

  // --- volume ---
  it('declares and mounts named volumes', () => {
    const plan: BuildPlan = {
      version: 1,
      framework: 'laravel',
      runtime: 'php@8.3',
      root: '',
      port: 80,
      services: {
        app: { command: 'php-fpm', port: 9000 },
        web: { command: "nginx -g 'daemon off;'", port: 80, healthcheck: '/' },
      },
      volumes: ['storage'],
    };
    const result = render(plan);
    const doc = YAML.parse(result.compose) as Record<string, unknown>;
    expect(doc.volumes).toBeDefined();
    expect(Object.keys(doc.volumes as object)).toContain('test-proj_storage');
  });

  // --- YAML parsable ---
  it('produces valid YAML', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'docker', runtime: 'docker@1', root: '', port: 3000,
    };
    const result = render(plan);
    expect(() => YAML.parse(result.compose)).not.toThrow();
  });

  // --- Determinism ---
  it('produces identical output for identical inputs', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'laravel', runtime: 'php@8.3', root: '', port: 80,
      services: {
        app: { command: 'php-fpm', port: 9000 },
        web: { command: "nginx -g 'daemon off;'", port: 80, healthcheck: '/' },
      },
    };
    const ctx: RenderContext = {
      ...baseCtx,
      domain: 'det.example.com',
      traefik: baseTraefik,
      env: { DATABASE_URL: 'postgres://...', APP_KEY: 'base64:...' },
    };
    const a = renderStack(plan, ctx);
    const b = renderStack(plan, ctx);
    expect(a.compose).toBe(b.compose);
    expect(a.envTemplate).toBe(b.envTemplate);
  });

  // --- projectId validation ---
  it('rejects an invalid projectId', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'docker', runtime: 'docker@1', root: '', port: 3000,
    };
    expect(() => render(plan, { projectId: 'Foo Bar' })).toThrow(RenderError);
    expect(() => render(plan, { projectId: 'Foo Bar' })).toThrow(/invalide/);
  });

  // --- unknown framework ---
  it('rejects an unknown framework', () => {
    const plan = {
      version: 1 as const,
      framework: 'magic' as never,
      runtime: 'unknown@1',
      root: '',
      port: 9999,
    };
    expect(() => renderStack(plan, baseCtx)).toThrow(RenderError);
    expect(() => renderStack(plan, baseCtx)).toThrow(/magic/);
  });

  // --- secrets forbidden in YAML ---
  it('never includes secret values in the compose YAML', () => {
    const plan: BuildPlan = {
      version: 1, framework: 'nextjs', runtime: 'node@22', root: '', port: 3000,
    };
    const ctx: RenderContext = {
      ...baseCtx,
      env: { DATABASE_URL: 'postgres://user:supersecret@host/db', API_KEY: 'sk-live-api_key_value' },
    };
    const result = renderStack(plan, ctx);
    secretsForbidden(result.compose);
    // envTemplate must contain the keys but empty values
    expect(result.envTemplate).toContain('DATABASE_URL=');
    expect(result.envTemplate).toContain('API_KEY=');
    expect(result.envTemplate).not.toContain('supersecret');
    expect(result.envTemplate).not.toContain('api_key_value');
  });

  // --- multiple EXPOSE: docker with multiple ports ---
  it('warns about build args from a docker plan', () => {
    const plan: BuildPlan = {
      version: 1,
      framework: 'docker',
      runtime: 'docker@1',
      root: '',
      port: 3000,
      buildArgs: { NEXT_PUBLIC_URL: 'https://cdn.example.com', COMMIT_HASH: '' },
    };
    const result = render(plan);
    expect(result.metadata.warnings.join(' ')).toContain('NEXT_PUBLIC_URL');
    expect(result.metadata.warnings.join(' ')).toContain('COMMIT_HASH');
  });
});