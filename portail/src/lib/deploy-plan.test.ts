import { describe, expect, it } from 'vitest'
import type { BuildPlan } from '@eflex/detector'
import {
  buildApplicationLabels,
  buildProjectArtifacts,
  coolifyApplicationSettings,
  nixpacksRuntimeVariable,
  normalizeHost,
  persistentVolumesEnabled,
  publishDirectoryForPlan,
} from './deploy-plan'

const pythonPlan: BuildPlan = {
  version: 1,
  framework: 'python',
  runtime: 'python@3.12',
  root: '',
  port: 8000,
  install: 'pip install -r requirements.txt',
  start: 'uvicorn main:app --host 0.0.0.0 --port 8000',
}

const dockerPlan: BuildPlan = {
  version: 1,
  framework: 'docker',
  runtime: 'docker@1',
  root: '',
  port: 3000,
}

const monorepoPlan: BuildPlan = {
  version: 1,
  framework: 'nextjs',
  runtime: 'node@22',
  root: 'apps/web',
  repoRoot: '../..',
  workspace: { manager: 'pnpm', name: '@acme/web', buildScript: 'build' },
  install: 'pnpm install --frozen-lockfile',
  build: 'next build',
  start: 'next start',
  port: 3000,
}

const monorepoStaticPlan: BuildPlan = {
  version: 1,
  framework: 'static',
  runtime: 'static@1',
  root: 'apps/site',
  repoRoot: '../..',
  workspace: { manager: 'pnpm', name: '@acme/site', buildScript: 'build' },
  install: 'pnpm install --frozen-lockfile',
  build: 'pnpm run build',
  publish: 'dist',
  port: 80,
}

describe('buildProjectArtifacts', () => {
  it('transmet le port réel du plan, pas 3000 par défaut', () => {
    const artifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(artifacts.portsExposes).toBe(8000)
    expect(artifacts.buildPack).toBe('dockercompose')
    expect(artifacts.files['Dockerfile']).toContain('EXPOSE 8000')
  })

  it('ne génère aucun appel implicite à nixpacks', () => {
    const artifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(artifacts.buildPack).not.toBe('nixpacks')
    expect(artifacts.compose).not.toMatch(/nixpacks/i)
  })

  it('framework docker : le Dockerfile du dépôt fait foi', () => {
    const artifacts = buildProjectArtifacts(dockerPlan, 'dock-proj')
    expect(artifacts.buildPack).toBe('dockerfile')
    expect(artifacts.dockerfile).toBeNull()
    expect(artifacts.compose).toBe('')
  })

  it('ne place jamais de secret dans les artefacts', () => {
    const artifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(artifacts.compose).not.toMatch(/supersecret|API_KEY=/)
    expect(artifacts.files['Dockerfile'] ?? '').not.toMatch(/supersecret|API_KEY=/)
  })
})

describe('coolifyApplicationSettings', () => {
  it('ne change rien pour une application à la racine du dépôt', () => {
    const settings = coolifyApplicationSettings(pythonPlan)

    expect(settings.baseDirectory).toBe('/')
    expect(settings.baseDirectoryIsDefault).toBe(true)
    expect(settings.installCommand).toBe('pip install -r requirements.txt')
    expect(settings.buildCommand).toBeUndefined()
    expect(settings.startCommand).toBe('uvicorn main:app --host 0.0.0.0 --port 8000')
    expect(settings.publishDirectory).toBeUndefined()
    expect(settings.dockerfileLocation).toBeUndefined()
  })

  it('construit un monorepo pnpm depuis la racine et démarre dans l’application', () => {
    const settings = coolifyApplicationSettings(monorepoPlan)

    expect(settings.baseDirectory).toBe('/')
    // Installation à la racine : le lockfile et les paquets voisins sont visibles.
    expect(settings.installCommand).toBe('pnpm install --frozen-lockfile')
    // Filtre pnpm : construit le paquet et ses dépendances internes.
    expect(settings.buildCommand).toBe("pnpm --filter '@acme/web'... run 'build'")
    expect(settings.startCommand).toBe("cd 'apps/web' && next start")
  })

  it('publie la sortie statique relativement au dossier de travail', () => {
    const settings = coolifyApplicationSettings(monorepoStaticPlan)
    expect(settings.publishDirectory).toBe('/apps/site/dist')
  })

  it('garde le dossier du sous-projet quand il ne s’agit pas d’un workspace', () => {
    const standalone: BuildPlan = {
      ...monorepoPlan,
      workspace: undefined,
      repoRoot: undefined,
    }
    const settings = coolifyApplicationSettings(standalone)

    expect(settings.baseDirectory).toBe('/apps/web')
    expect(settings.baseDirectoryIsDefault).toBe(false)
    expect(settings.installCommand).toBe('pnpm install --frozen-lockfile')
    expect(settings.buildCommand).toBe('next build')
    expect(settings.startCommand).toBe('next start')
  })

  it('déploie un Dockerfile de sous-dossier depuis le dossier de l’application', () => {
    const settings = coolifyApplicationSettings({
      ...dockerPlan,
      root: 'apps/api',
      repoRoot: '../..',
      dockerfile: 'docker/Dockerfile',
    })

    expect(settings.baseDirectory).toBe('/apps/api')
    expect(settings.dockerfileLocation).toBe('/docker/Dockerfile')
  })

  it('conserve le Dockerfile à la racine du dépôt', () => {
    const settings = coolifyApplicationSettings({ ...dockerPlan, dockerfile: 'docker/Dockerfile' })
    expect(settings.baseDirectory).toBe('/')
    expect(settings.dockerfileLocation).toBe('/docker/Dockerfile')
  })

  it('n’active les volumes que sur demande explicite', () => {
    expect(persistentVolumesEnabled({})).toBe(false)
    expect(persistentVolumesEnabled({ EFLEX_PERSISTENT_VOLUMES: '0' })).toBe(false)
    expect(persistentVolumesEnabled({ EFLEX_PERSISTENT_VOLUMES: 'true' })).toBe(true)
    expect(persistentVolumesEnabled({ EFLEX_PERSISTENT_VOLUMES: '1' })).toBe(true)
  })
})

describe('nixpacksRuntimeVariable', () => {
  it('mappe le runtime du plan vers la variable Nixpacks', () => {
    expect(nixpacksRuntimeVariable('node@22')).toEqual({
      key: 'NIXPACKS_NODE_VERSION',
      value: '22',
    })
    expect(nixpacksRuntimeVariable('python@3.12')).toEqual({
      key: 'NIXPACKS_PYTHON_VERSION',
      value: '3.12',
    })
    expect(nixpacksRuntimeVariable('php@8.3')).toEqual({
      key: 'NIXPACKS_PHP_VERSION',
      value: '8.3',
    })
    expect(nixpacksRuntimeVariable('static@1')).toBeNull()
    expect(nixpacksRuntimeVariable('node')).toBeNull()
  })
})

describe('publishDirectoryForPlan', () => {
  it('publie /dist pour un site statique avec build, la racine sinon', () => {
    expect(
      publishDirectoryForPlan({ ...pythonPlan, framework: 'static', build: 'npm run build' }),
    ).toBe('/dist')
    expect(publishDirectoryForPlan({ ...pythonPlan, framework: 'static', build: undefined })).toBe(
      '/',
    )
    expect(publishDirectoryForPlan(pythonPlan)).toBeUndefined()
  })
})

describe('buildApplicationLabels', () => {
  it('génère les labels Traefik du Traefik existant', () => {
    const labels = buildApplicationLabels('demo', 'https://demo.example.com/', 3000)

    expect(labels).toContain('traefik.enable=true')
    expect(labels).toContain('traefik.docker.network=proxy')
    expect(labels).toContain('traefik.http.routers.demo-app.rule=Host(`demo.example.com`)')
    expect(labels).toContain('traefik.http.routers.demo-app.entrypoints=websecure')
    expect(labels).toContain('traefik.http.services.demo-app.loadbalancer.server.port=3000')
  })

  it('normalise le domaine', () => {
    expect(normalizeHost('https://demo.example.com/path')).toBe('demo.example.com')
    expect(normalizeHost(' demo.example.com ')).toBe('demo.example.com')
  })
})
