import { afterEach, describe, expect, it, vi } from 'vitest'

type Call = { url: string; init?: RequestInit }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): Call[] {
  const calls: Call[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, init })
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

async function loadModule() {
  vi.resetModules()
  vi.stubEnv('COOLIFY_API_URL', 'https://coolify.test/api/v1')
  vi.stubEnv('COOLIFY_API_TOKEN', 'test-token')
  vi.stubEnv('COOLIFY_PROJECT_NAME', 'Eflex')
  vi.stubEnv('COOLIFY_ENVIRONMENT', 'production')
  vi.stubEnv('COOLIFY_PROJECT_UUID', '')
  vi.stubEnv('COOLIFY_SERVER_UUID', '')
  return import('./coolify')
}

/** Réponses de découverte : serveur, projet (créé ou existant), environnement. */
function targetHandler(projectExists: boolean) {
  return (url: string, init?: RequestInit): Response => {
    const method = init?.method ?? 'GET'
    if (url.endsWith('/servers')) {
      return json([{ uuid: 'srv', is_coolify_host: true, is_usable: true }])
    }
    if (url.endsWith('/projects') && method === 'GET') {
      return json(projectExists ? [{ uuid: 'proj', name: 'Eflex' }] : [])
    }
    if (url.endsWith('/projects') && method === 'POST') {
      return json({ uuid: 'proj' }, 201)
    }
    if (url.endsWith('/projects/proj/environments') && method === 'GET') {
      return json([{ uuid: 'env', name: 'production' }])
    }
    throw new Error(`requête inattendue : ${method} ${url}`)
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createApplication', () => {
  it('crée une application Nixpacks avec la cible découverte et les commandes du plan', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) return json({ uuid: 'app' }, 201)
      return targetHandler(false)(url, init)
    })
    const { createApplication } = await loadModule()

    const result = await createApplication({
      name: 'demo',
      gitRepository: 'https://github.com/o/r',
      gitBranch: 'main',
      buildPack: 'nixpacks',
      portsExposes: '3000',
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      publishDirectory: 'dist',
    })

    expect(result).toEqual({ id: 'app' })
    const call = calls.find((item) => item.url.endsWith('/applications/public'))
    expect(call).toBeDefined()
    const body = JSON.parse(String(call?.init?.body))
    expect(body).toMatchObject({
      name: 'demo',
      project_uuid: 'proj',
      server_uuid: 'srv',
      environment_name: 'production',
      git_repository: 'https://github.com/o/r',
      git_branch: 'main',
      build_pack: 'nixpacks',
      install_command: 'npm ci',
      build_command: 'npm run build',
      start_command: 'npm start',
      publish_directory: 'dist',
      ports_exposes: '3000',
      connect_to_docker_network: true,
      autogenerate_domain: false,
    })
    expect(body.docker_compose_raw).toBeUndefined()
    expect(body.dockerfile).toBeUndefined()
  })

  it('réutilise un projet existant sans en créer un nouveau', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) return json({ uuid: 'app' }, 201)
      return targetHandler(true)(url, init)
    })
    const { createApplication } = await loadModule()

    await createApplication({
      name: 'demo',
      gitRepository: 'https://github.com/o/r',
      buildPack: 'dockerfile',
      portsExposes: '80',
    })

    expect(calls.some((item) => item.init?.method === 'POST' && item.url.endsWith('/projects'))).toBe(false)
  })

  it('crée une application dockerfile avec domaine normalisé et labels Traefik', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) return json({ uuid: 'app' }, 201)
      return targetHandler(true)(url, init)
    })
    const { createApplication } = await loadModule()
    const labels = [
      'traefik.enable=true',
      'traefik.http.routers.demo-app.entrypoints=websecure',
    ]

    const result = await createApplication({
      name: 'demo',
      gitRepository: 'https://github.com/o/r',
      buildPack: 'dockerfile',
      portsExposes: '80',
      fqdn: 'https://demo.example.com/',
      customLabels: labels,
      postDeploymentCommand: 'php artisan migrate --force',
      baseDirectory: '/apps/api',
      dockerfileLocation: '/docker/Dockerfile',
    })

    expect(result).toEqual({ id: 'app' })
    const call = calls.find((item) => item.url.endsWith('/applications/public'))
    const body = JSON.parse(String(call?.init?.body))
    expect(body.domains).toBe('https://demo.example.com')
    expect(body.custom_labels).toBe(Buffer.from(labels.join('\n'), 'utf8').toString('base64'))
    expect(body.post_deployment_command).toBe('php artisan migrate --force')
    expect(body.base_directory).toBe('/apps/api')
    expect(body.dockerfile_location).toBe('/docker/Dockerfile')
    expect(body.docker_compose_raw).toBeUndefined()
  })

  it('n’envoie pas de dossier de travail pour un dépôt déployé à la racine', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) return json({ uuid: 'app' }, 201)
      return targetHandler(true)(url, init)
    })
    const { createApplication } = await loadModule()

    await createApplication({
      name: 'demo',
      gitRepository: 'https://github.com/o/r',
      buildPack: 'nixpacks',
      portsExposes: '3000',
    })

    const body = JSON.parse(
      String(calls.find((item) => item.url.endsWith('/applications/public'))?.init?.body),
    )
    expect(body.base_directory).toBeUndefined()
    expect(body.dockerfile_location).toBeUndefined()
  })

  it('remonte le message d’erreur de l’API', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) {
        return json({ message: 'Validation failed.' }, 422)
      }
      return targetHandler(true)(url, init)
    })
    const { createApplication } = await loadModule()

    await expect(
      createApplication({
        name: 'demo',
        gitRepository: 'https://github.com/o/r',
        buildPack: 'dockerfile',
        portsExposes: '80',
      }),
    ).resolves.toEqual({ error: 'Hébergement API 422: Validation failed.' })
  })
})

describe('updateApplication', () => {
  it('réapplique les commandes du plan sur une application existante', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/app') && init?.method === 'PATCH') return json({ uuid: 'app' })
      throw new Error(`requête inattendue : ${init?.method ?? 'GET'} ${url}`)
    })
    const { updateApplication } = await loadModule()

    await expect(
      updateApplication('app', {
        baseDirectory: '/',
        dockerfileLocation: '/docker/Dockerfile',
        installCommand: 'pnpm install --frozen-lockfile --ignore-workspace',
        buildCommand: 'next build',
        startCommand: 'next start',
        publishDirectory: '/',
        portsExposes: '3000',
      }),
    ).resolves.toEqual({ ok: true })

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      base_directory: '/',
      dockerfile_location: '/docker/Dockerfile',
      install_command: 'pnpm install --frozen-lockfile --ignore-workspace',
      build_command: 'next build',
      start_command: 'next start',
      publish_directory: '/',
      ports_exposes: '3000',
    })
  })
})

describe('deployApplication', () => {
  it('déclenche POST /deploy et lit deployments[].deployment_uuid', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/deploy')) {
        return json({
          deployments: [{ resource_uuid: 'app', deployment_uuid: 'dep' }],
        })
      }
      throw new Error(url)
    })
    const { deployApplication } = await loadModule()

    await expect(deployApplication('app')).resolves.toEqual({ deploymentId: 'dep' })
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ uuid: 'app' })
  })

  it('renvoie le message Coolify quand aucun déploiement n’est créé', async () => {
    mockFetch(() => json({ deployments: [{ resource_uuid: 'app', message: 'Nothing to deploy.' }] }))
    const { deployApplication } = await loadModule()

    await expect(deployApplication('app')).resolves.toEqual({
      error: 'Nothing to deploy.',
    })
  })
})

describe('getDeploymentStatus / getDeploymentLogs', () => {
  it('lit le statut et décode les logs JSON de Coolify', async () => {
    mockFetch((url) => {
      if (url.endsWith('/deployments/dep')) {
        return json({
          status: 'finished',
          logs: JSON.stringify([
            { name: 'Build', output: 'step 1' },
            { name: 'Build', output: 'step 2' },
          ]),
        })
      }
      throw new Error(url)
    })
    const { getDeploymentStatus, getDeploymentLogs } = await loadModule()

    await expect(getDeploymentStatus('dep')).resolves.toEqual({ status: 'finished' })
    await expect(getDeploymentLogs('dep')).resolves.toEqual({ logs: 'step 1\nstep 2' })
  })

  it('laisse passer un log non JSON', async () => {
    mockFetch(() => json({ status: 'in_progress', logs: 'texte brut' }))
    const { getDeploymentLogs } = await loadModule()

    await expect(getDeploymentLogs('dep')).resolves.toEqual({ logs: 'texte brut' })
  })
})

describe('decodeDeploymentLogs', () => {
  it('gère les valeurs vides et les entrées sans output', async () => {
    const { decodeDeploymentLogs } = await loadModule()

    expect(decodeDeploymentLogs(null)).toBe('')
    expect(decodeDeploymentLogs('')).toBe('')
    expect(decodeDeploymentLogs(JSON.stringify([{ name: 'Build' }, 'ligne']))).toBe('ligne')
  })
})

describe('cancelDeployment', () => {
  it('poste sur /deployments/{uuid}/cancel', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/deployments/dep-1/cancel')) return json({ message: 'Deployment cancelled.' })
      throw new Error(url)
    })
    const { cancelDeployment } = await loadModule()

    await expect(cancelDeployment('dep-1')).resolves.toEqual({ ok: true })
    expect(calls[0]?.init?.method).toBe('POST')
  })

  it('traite un déploiement déjà terminé comme « rien à annuler »', async () => {
    mockFetch(() => json({ message: 'Deployment cannot be cancelled. Current status: finished' }, 400))
    const { cancelDeployment } = await loadModule()

    await expect(cancelDeployment('dep-1')).resolves.toEqual({ ok: true, alreadyFinished: true })
  })

  it('remonte les autres erreurs d’infrastructure', async () => {
    mockFetch(() => json({ message: 'Internal error.' }, 500))
    const { cancelDeployment } = await loadModule()

    await expect(cancelDeployment('dep-1')).resolves.toEqual({
      error: 'Hébergement API 500: Internal error.',
    })
  })
})

describe('setApplicationLabels', () => {
  it('patche les custom_labels en base64', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/applications/app')) return json({ uuid: 'app' })
      throw new Error(url)
    })
    const { setApplicationLabels } = await loadModule()
    const labels = ['traefik.enable=true', 'traefik.http.routers.x.entrypoints=websecure']

    await expect(setApplicationLabels('app', labels)).resolves.toEqual({ ok: true })
    expect(calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      custom_labels: Buffer.from(labels.join('\n'), 'utf8').toString('base64'),
      is_container_label_readonly_enabled: false,
      is_auto_deploy_enabled: false,
    })
  })
})

describe('deleteApplication', () => {
  it('envoie DELETE sur /applications/{uuid}', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/applications/app')) return new Response(null, { status: 204 })
      throw new Error(url)
    })
    const { deleteApplication } = await loadModule()

    await expect(deleteApplication('app')).resolves.toEqual({ ok: true })
    expect(calls[0]?.init?.method).toBe('DELETE')
  })

  it('traite une application déjà absente comme une suppression réussie', async () => {
    mockFetch(() => json({ message: 'Application not found.' }, 404))
    const { deleteApplication } = await loadModule()

    await expect(deleteApplication('app')).resolves.toEqual({ ok: true })
  })

  it('remonte les autres erreurs Coolify sans supprimer la trace locale', async () => {
    mockFetch(() => json({ message: 'Internal error.' }, 500))
    const { deleteApplication } = await loadModule()

    await expect(deleteApplication('app')).resolves.toEqual({
      error: 'Hébergement API 500: Internal error.',
    })
  })
})

describe('setEnvironmentVariable', () => {
  it('poste sur /applications/{uuid}/envs', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/applications/app/envs')) return json({ uuid: 'env-1' }, 201)
      throw new Error(url)
    })
    const { setEnvironmentVariable } = await loadModule()

    await expect(setEnvironmentVariable('app', 'KEY', 'value')).resolves.toEqual({ ok: true })
    expect(calls[0]?.url).toBe('https://coolify.test/api/v1/applications/app/envs')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ key: 'KEY', value: 'value' })
  })

  it('met à jour la variable si elle existe déjà (409)', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/app/envs')) {
        if ((init?.method ?? 'GET') === 'POST') {
          return json(
            { message: 'Environment variable already exists. Use PATCH request to update it.' },
            409,
          )
        }
        if (init?.method === 'PATCH') return json({ uuid: 'env-1' })
      }
      throw new Error(url)
    })
    const { setEnvironmentVariable } = await loadModule()

    await expect(setEnvironmentVariable('app', 'KEY', 'value', true)).resolves.toEqual({ ok: true })
    expect(calls.map((call) => call.init?.method)).toEqual(['POST', 'PATCH'])
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      key: 'KEY',
      value: 'value',
      is_buildtime: true,
    })
  })
})

describe('ensureApplicationStorages', () => {
  it('ne crée que les volumes absents et laisse les existants intacts', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/app/storages') && (init?.method ?? 'GET') === 'GET') {
        return json({ persistent_storages: [{ uuid: 's1', mount_path: '/app/storage' }] })
      }
      if (url.endsWith('/applications/app/storages') && init?.method === 'POST') {
        return json({ uuid: 's2', mount_path: '/app/data' }, 201)
      }
      throw new Error(`${init?.method ?? 'GET'} ${url}`)
    })
    const { ensureApplicationStorages } = await loadModule()

    await expect(
      ensureApplicationStorages('app', [
        { name: 'eflex-storage', mountPath: '/app/storage' },
        { name: 'eflex-data', mountPath: '/app/data' },
      ]),
    ).resolves.toEqual({ created: 1, existing: 1 })

    const writes = calls.filter((call) => call.init?.method === 'POST')
    expect(writes).toHaveLength(1)
    expect(JSON.parse(String(writes[0]?.init?.body))).toEqual({
      type: 'persistent',
      name: 'eflex-data',
      mount_path: '/app/data',
    })
  })

  it('échoue explicitement quand l’API de stockage est indisponible', async () => {
    mockFetch(() => json({ message: 'Application not found.' }, 404))
    const { ensureApplicationStorages } = await loadModule()

    await expect(
      ensureApplicationStorages('app', [{ name: 'eflex-storage', mountPath: '/app/storage' }]),
    ).resolves.toEqual({
      error: 'Stockages de l’application illisibles : Hébergement API 404: Application not found.',
    })
  })

  it('échoue explicitement quand la création d’un volume est refusée', async () => {
    mockFetch((url, init) => {
      if ((init?.method ?? 'GET') === 'GET') return json({ persistent_storages: [] })
      return json({ message: 'Validation failed.' }, 422)
    })
    const { ensureApplicationStorages } = await loadModule()

    await expect(
      ensureApplicationStorages('app', [{ name: 'eflex-storage', mountPath: '/app/storage' }]),
    ).resolves.toEqual({
      error: 'Volume « /app/storage » non créé : Hébergement API 422: Validation failed.',
    })
  })

  it('ne fait aucun appel sans volume déclaré', async () => {
    const calls = mockFetch(() => json({}, 500))
    const { ensureApplicationStorages } = await loadModule()

    await expect(ensureApplicationStorages('app', [])).resolves.toEqual({ created: 0, existing: 0 })
    expect(calls).toHaveLength(0)
  })
})

describe('checkConnection', () => {
  it('accepte la réponse texte « OK » de /health', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { checkConnection } = await loadModule()

    await expect(checkConnection()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://coolify.test/api/v1/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    )
  })

  it('renvoie false quand l’API répond en erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('indisponible', { status: 503 })))
    const { checkConnection } = await loadModule()

    await expect(checkConnection()).resolves.toBe(false)
  })

  it('renvoie false quand le réseau échoue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { checkConnection } = await loadModule()

    await expect(checkConnection()).resolves.toBe(false)
  })
})
