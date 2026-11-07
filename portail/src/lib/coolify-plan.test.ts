import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { detect } from '@eflex/detector'
import type { BuildPlan } from '@eflex/detector'
import { allFixtures } from '../../../packages/detector/test/fixtures'
import { mergeEnv, planToCoolify } from '@/lib/coolify-plan'

// Schémas extraits de la spécification OpenAPI officielle de Coolify.
const schemas = JSON.parse(
  readFileSync(new URL('./test-support/coolify-api-schemas.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, unknown>>

// L'API de Coolify refuse les champs inconnus : on le vérifie en interdisant les propriétés
// supplémentaires, ce que le schéma OpenAPI ne déclare pas lui-même.
const strict = (schema: Record<string, unknown>) => ({ ...schema, additionalProperties: false })
const ajv = new Ajv({ strict: false, allErrors: true })
const validateCreate = ajv.compile(strict(schemas.createPublicApplication!))

// Ce que le client ajoute lui-même (voir CoolifyClient.createApplication).
const location = { project_uuid: 'prj_abc123', server_uuid: 'srv_abc123', environment_name: 'production' }

const ctx = { name: 'mon-projet', repoUrl: 'https://github.com/acme/app', branch: 'main', domain: 'mon-projet.apps.exemple.fr' }

const plan = (overrides: Partial<BuildPlan> & Pick<BuildPlan, 'framework' | 'runtime'>): BuildPlan => ({
  version: 1,
  root: '',
  port: 3000,
  ...overrides,
})

function expectValid(payload: Record<string, unknown>) {
  const ok = validateCreate({ ...payload, ...location })
  expect(validateCreate.errors ?? [], JSON.stringify(payload)).toEqual([])
  expect(ok).toBe(true)
}

describe('planToCoolify : conformité à l’API Coolify', () => {
  it('produit une charge utile valide pour chaque plan que le détecteur sait produire', () => {
    let checked = 0
    for (const { name, snapshot } of allFixtures()) {
      const result = detect(snapshot)
      for (const p of [result.plan, ...result.alternatives]) {
        if (!p) continue
        for (const app of planToCoolify(p, ctx).apps) {
          expectValid(app.payload)
          checked += 1
        }
      }
      expect(name).toBeTruthy()
    }
    // Garde-fou : le test doit réellement parcourir des plans.
    expect(checked).toBeGreaterThan(30)
  })

  it('rejette bien un champ inventé (le contrôle est sérieux)', () => {
    expect(validateCreate({ ...location, git_repository: 'x', git_branch: 'main', build_pack: 'nixpacks', fqdn: 'x.fr' })).toBe(false)
    expect(validateCreate({ ...location, git_repository: 'x', git_branch: 'main', build_pack: 'magie' })).toBe(false)
    expect(validateCreate({ git_repository: 'x', git_branch: 'main', build_pack: 'nixpacks' })).toBe(false)
  })
})

describe('planToCoolify : correspondance', () => {
  it('Next.js : Nixpacks avec les commandes et le port du plan', () => {
    const { apps } = planToCoolify(
      plan({ framework: 'nextjs', runtime: 'node@22', install: 'pnpm install --frozen-lockfile', build: 'next build', start: 'next start' }),
      ctx,
    )
    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      role: 'web',
      payload: {
        name: 'mon-projet',
        git_repository: 'https://github.com/acme/app',
        git_branch: 'main',
        build_pack: 'nixpacks',
        ports_exposes: '3000',
        install_command: 'pnpm install --frozen-lockfile',
        build_command: 'next build',
        start_command: 'next start',
        domains: 'https://mon-projet.apps.exemple.fr',
      },
    })
  })

  it('Python : le port du plan (8000), pas 3000', () => {
    const { apps } = planToCoolify(plan({ framework: 'python', runtime: 'python@3.12', port: 8000, start: 'uvicorn main:app --host 0.0.0.0 --port 8000' }), ctx)
    expect(apps[0]?.payload.ports_exposes).toBe('8000')
  })

  it('site statique : build pack static, nginx, dossier publié', () => {
    const { apps } = planToCoolify(
      plan({ framework: 'vite', runtime: 'static@1', port: 80, install: 'npm ci', build: 'npm run build', publish: 'dist' }),
      ctx,
    )
    expect(apps[0]?.payload).toMatchObject({
      build_pack: 'static',
      is_static: true,
      static_image: 'nginx:alpine',
      publish_directory: '/dist',
      ports_exposes: '80',
      install_command: 'npm ci',
      build_command: 'npm run build',
    })
    expect(apps[0]?.payload).not.toHaveProperty('start_command')
  })

  it('site statique sans build : la racine est publiée', () => {
    const { apps } = planToCoolify(plan({ framework: 'static', runtime: 'static@1', port: 80 }), ctx)
    expect(apps[0]?.payload).toMatchObject({ build_pack: 'static', publish_directory: '/' })
    expect(apps[0]?.payload).not.toHaveProperty('build_command')
  })

  it('Dockerfile : build pack dockerfile, emplacement par défaut puis personnalisé', () => {
    expect(planToCoolify(plan({ framework: 'docker', runtime: 'docker@1', port: 8080 }), ctx).apps[0]?.payload).toMatchObject({
      build_pack: 'dockerfile',
      dockerfile_location: '/Dockerfile',
      ports_exposes: '8080',
    })
    expect(
      planToCoolify(plan({ framework: 'docker', runtime: 'docker@1', dockerfile: 'docker/Dockerfile' }), ctx).apps[0]?.payload.dockerfile_location,
    ).toBe('/docker/Dockerfile')
  })

  it('un plan eflex.json de runtime docker suit aussi le Dockerfile', () => {
    expect(planToCoolify(plan({ framework: 'eflex-config', runtime: 'docker@1' }), ctx).apps[0]?.payload.build_pack).toBe('dockerfile')
  })

  it('monorepo : dossier de base, avec un avertissement', () => {
    const result = planToCoolify(plan({ framework: 'nextjs', runtime: 'node@22', root: 'apps/web', repoRoot: '../..' }), ctx)
    expect(result.apps[0]?.payload.base_directory).toBe('/apps/web')
    expect(result.warnings.join(' ')).toMatch(/apps\/web/)
  })

  it('santé : activée seulement si le plan la déclare', () => {
    const without = planToCoolify(plan({ framework: 'node', runtime: 'node@22' }), ctx).apps[0]?.payload
    expect(without).not.toHaveProperty('health_check_enabled')

    const withCheck = planToCoolify(plan({ framework: 'node', runtime: 'node@22', healthcheck: '/health' }), ctx).apps[0]?.payload
    expect(withCheck).toMatchObject({ health_check_enabled: true, health_check_path: '/health' })
  })

  it('ressources : CPU et mémoire', () => {
    const payload = planToCoolify(plan({ framework: 'node', runtime: 'node@22', resources: { cpu: 0.5, memoryMb: 512 } }), ctx).apps[0]?.payload
    expect(payload).toMatchObject({ limits_cpus: '0.5', limits_memory: '512m' })
  })

  it('sans domaine configuré, aucun champ domains n’est envoyé', () => {
    const payload = planToCoolify(plan({ framework: 'node', runtime: 'node@22' }), { ...ctx, domain: undefined }).apps[0]?.payload
    expect(payload).not.toHaveProperty('domains')
  })

  describe('Laravel', () => {
    const laravel = plan({
      framework: 'laravel',
      runtime: 'php@8.3',
      port: 80,
      install: 'composer install --no-dev --optimize-autoloader',
      build: 'npm ci && npm run build',
      services: {
        app: { command: 'php-fpm', port: 9000 },
        web: { command: "nginx -g 'daemon off;'", port: 80, healthcheck: '/' },
        queue: { command: 'php artisan queue:work --tries=3 --sleep=1', replicas: 1 },
        scheduler: { command: 'php artisan schedule:work' },
      },
      volumes: ['storage'],
      postDeploy: ['php artisan migrate --force', 'php artisan config:cache'],
    })

    it('une application web et un worker par service supplémentaire', () => {
      const { apps } = planToCoolify(laravel, ctx)
      expect(apps.map((a) => a.role)).toEqual(['web', 'queue', 'scheduler'])
      expect(apps.map((a) => a.payload.name)).toEqual(['mon-projet', 'mon-projet-queue', 'mon-projet-scheduler'])
    })

    it('la commande de démarrage de chaque worker est celle du plan', () => {
      const { apps } = planToCoolify(laravel, ctx)
      expect(apps[1]?.payload.start_command).toBe('php artisan queue:work --tries=3 --sleep=1')
      expect(apps[2]?.payload.start_command).toBe('php artisan schedule:work')
      expect(apps[0]?.payload).not.toHaveProperty('start_command')
    })

    it('les workers n’ont ni domaine, ni sonde, ni commande post-déploiement', () => {
      for (const worker of planToCoolify(laravel, ctx).apps.slice(1)) {
        expect(worker.payload).not.toHaveProperty('domains')
        expect(worker.payload).not.toHaveProperty('health_check_enabled')
        expect(worker.payload).not.toHaveProperty('post_deployment_command')
        expect(worker.payload.build_pack).toBe('nixpacks')
      }
    })

    it('les migrations tournent après le déploiement de l’application web, enchaînées', () => {
      expect(planToCoolify(laravel, ctx).apps[0]?.payload.post_deployment_command).toBe(
        'php artisan migrate --force && php artisan config:cache',
      )
    })

    it('avertit que le volume storage n’est pas monté', () => {
      expect(planToCoolify(laravel, ctx).warnings.join(' ')).toMatch(/storage/)
    })

    it('Laravel minimal : une seule application', () => {
      const minimal = plan({ ...laravel, services: { app: laravel.services!.app!, web: laravel.services!.web! }, postDeploy: undefined })
      expect(planToCoolify(minimal, ctx).apps).toHaveLength(1)
    })
  })

  it('avertit quand des réplicas sont demandés', () => {
    const p = plan({ framework: 'node', runtime: 'node@22', services: { web: { command: 'node s.js' }, worker: { command: 'node w.js', replicas: 3 } } })
    expect(planToCoolify(p, ctx).warnings.join(' ')).toMatch(/3 réplicas/)
  })

  it('ne déploie pas de services supplémentaires derrière un Dockerfile, et le dit', () => {
    const p = plan({ framework: 'docker', runtime: 'docker@1', services: { web: { command: 'x' }, worker: { command: 'y' } } })
    const result = planToCoolify(p, ctx)
    expect(result.apps).toHaveLength(1)
    expect(result.warnings.join(' ')).toMatch(/worker/)
  })
})

describe('variables du plan', () => {
  it('reprend buildEnv et buildArgs', () => {
    const result = planToCoolify(
      plan({ framework: 'docker', runtime: 'docker@1', buildEnv: { PUBLIC_URL: 'https://a.fr' }, buildArgs: { NODE_ENV: 'production' } }),
      ctx,
    )
    expect(result.env).toEqual([
      { key: 'PUBLIC_URL', value: 'https://a.fr' },
      { key: 'NODE_ENV', value: 'production' },
    ])
  })

  it('mergeEnv : l’utilisateur l’emporte à clé égale', () => {
    expect(
      mergeEnv(
        [{ key: 'A', value: 'plan' }, { key: 'B', value: 'plan' }],
        [{ key: 'B', value: 'user' }, { key: 'C', value: 'user' }],
      ),
    ).toEqual([
      { key: 'A', value: 'plan' },
      { key: 'B', value: 'user' },
      { key: 'C', value: 'user' },
    ])
  })
})
