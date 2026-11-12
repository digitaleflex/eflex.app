import { describe, expect, it } from 'vitest'
import type { BuildPlan } from '@eflex/detector'
import {
  buildApplicationLabels,
  buildProjectArtifacts,
  composeDomains,
  coolifyApplicationSettings,
  deploymentKind,
  nixpacksRuntimeVariable,
  nixpacksRuntimeVariables,
  normalizeHost,
  persistentVolumesEnabled,
  publishDirectoryForPlan,
  repositoryCompose,
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

const composePlan: BuildPlan = {
  version: 1,
  framework: 'compose',
  runtime: 'docker@1',
  root: 'apps/api',
  repoRoot: '..',
  port: 80,
  compose: {
    location: '/docker-compose.yml',
    services: ['app', 'web', 'queue'],
    service: 'web',
  },
  volumes: ['storage'],
}

const laravelMultiPlan: BuildPlan = {
  version: 1,
  framework: 'laravel',
  runtime: 'php@8.3',
  root: '',
  port: 80,
  services: {
    app: { command: 'php-fpm', port: 9000 },
    web: { command: "nginx -g 'daemon off;'", port: 80 },
  },
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

  it('construit un monorepo Bun avec filtre et dépendances internes', () => {
    const settings = coolifyApplicationSettings({
      ...monorepoPlan,
      install: 'bun install --frozen-lockfile',
      workspace: { manager: 'bun', name: '@acme/web', buildScript: 'build' },
    })

    expect(settings.baseDirectory).toBe('/')
    expect(settings.installCommand).toBe('bun install --frozen-lockfile')
    expect(settings.buildCommand).toBe("bun --filter '@acme/web'... run 'build'")
    expect(settings.startCommand).toBe("cd 'apps/web' && next start")
  })

  it('construit un monorepo yarn/npm depuis la racine mais sans filtre automatique', () => {
    for (const manager of ['yarn', 'npm'] as const) {
      const settings = coolifyApplicationSettings({
        ...monorepoPlan,
        install: manager === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci',
        workspace: { manager, name: '@acme/web', buildScript: 'build' },
      })

      expect(settings.baseDirectory).toBe('/')
      expect(settings.installCommand).toBe(
        manager === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci',
      )
      expect(settings.buildCommand).toBe("cd 'apps/web' && next build")
      expect(settings.startCommand).toBe("cd 'apps/web' && next start")
    }
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

describe('compose fourni par le dépôt', () => {
  it('expose le chemin compose et ne génère aucun Dockerfile ni volume Coolify', () => {
    const artifacts = buildProjectArtifacts(composePlan, 'api-proj')

    expect(artifacts.buildPack).toBe('dockercompose')
    expect(artifacts.compose).toBe('')
    expect(artifacts.dockerfile).toBeNull()
    expect(artifacts.services).toEqual(['app', 'web', 'queue'])
    expect(artifacts.repositoryCompose).toEqual({
      location: '/docker-compose.yml',
      repoPath: 'apps/api/docker-compose.yml',
      services: ['app', 'web', 'queue'],
      service: 'web',
    })
    expect(artifacts.persistentVolumes).toEqual([])
  })

  it('utilise le dossier de l’application pour base_directory', () => {
    const settings = coolifyApplicationSettings(composePlan)

    expect(settings.baseDirectory).toBe('/apps/api')
    expect(settings.dockerComposeLocation).toBe('/docker-compose.yml')
    expect(settings.dockerfileLocation).toBeUndefined()
    expect(settings.installCommand).toBeUndefined()
    expect(settings.buildCommand).toBeUndefined()
    expect(settings.startCommand).toBeUndefined()
  })

  it('normalise le chemin compose et refuse de sortir du dépôt', () => {
    expect(repositoryCompose({ ...composePlan, compose: { ...composePlan.compose!, location: '../../etc/passwd' } })).toBeNull()
    expect(
      repositoryCompose({
        ...composePlan,
        root: '',
        compose: { location: 'docker/compose.yaml', services: ['app'] },
      }),
    ).toEqual({
      location: '/docker/compose.yaml',
      repoPath: 'docker/compose.yaml',
      services: ['app'],
    })
  })

  it('attache les domaines au service public, jamais à un service absent', () => {
    expect(composeDomains(['demo.example.com', 'https://custom.example.com/'], 'web')).toEqual([
      {
        name: 'web',
        domain: 'https://demo.example.com,https://custom.example.com',
      },
    ])
    expect(composeDomains(['demo.example.com'], undefined)).toEqual([])
  })

  it('aiguille compose, mono-service et refus multi-services', () => {
    const composeArtifacts = buildProjectArtifacts(composePlan, 'api-proj')
    expect(deploymentKind(composePlan, composeArtifacts)).toBe('compose')

    const pythonArtifacts = buildProjectArtifacts(pythonPlan, 'py-proj')
    expect(deploymentKind(pythonPlan, pythonArtifacts)).toBe('single')

    const laravelArtifacts = buildProjectArtifacts(laravelMultiPlan, 'laravel-proj')
    expect(laravelArtifacts.services.length).toBeGreaterThan(1)
    expect(deploymentKind(laravelMultiPlan, laravelArtifacts)).toBe('multiple-without-compose')

    const invalidCompose: BuildPlan = { ...composePlan, compose: undefined }
    const invalidArtifacts = buildProjectArtifacts(invalidCompose, 'api-proj')
    expect(deploymentKind(invalidCompose, invalidArtifacts)).toBe('invalid-compose')
  })
})

describe('nixpacksRuntimeVariables', () => {
  it('ajoute la version de Bun quand elle est connue', () => {
    expect(
      nixpacksRuntimeVariables({ runtime: 'node@22', packageManager: 'bun', packageManagerVersion: '1.3.0' }),
    ).toEqual([
      { key: 'NIXPACKS_NODE_VERSION', value: '22' },
      { key: 'NIXPACKS_BUN_VERSION', value: '1.3.0' },
    ])
  })
})
