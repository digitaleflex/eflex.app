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

  it('crée une application compose 4.7.3 sans domains ni ports_exposes', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) return json({ uuid: 'app-compose' }, 201)
      return targetHandler(true)(url, init)
    })
    const { createApplication } = await loadModule()

    const result = await createApplication({
      name: 'demo',
      gitRepository: 'https://github.com/o/r',
      buildPack: 'dockercompose',
      baseDirectory: '/apps/api',
      dockerComposeLocation: '/compose.yml',
      dockerComposeDomains: [
        {
          name: 'web',
          domain: 'https://demo.example.com,https://custom.example.com',
        },
      ],
      dockerComposeRaw: 'services:\n  web:\n    image: nginx:alpine\n',
      // Ces valeurs ne doivent jamais être envoyées pour un compose.
      portsExposes: '3000',
      fqdn: 'demo.example.com',
      domains: ['demo.example.com'],
      customLabels: ['traefik.enable=true'],
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      postDeploymentCommand: 'php artisan migrate --force',
    })

    expect(result).toEqual({ id: 'app-compose' })
    const body = JSON.parse(
      String(calls.find((item) => item.url.endsWith('/applications/public'))?.init?.body),
    )
    expect(body).toMatchObject({
      build_pack: 'dockercompose',
      base_directory: '/apps/api',
      docker_compose_location: '/compose.yml',
      docker_compose_domains: [
        {
          name: 'web',
          domain: 'https://demo.example.com,https://custom.example.com',
        },
      ],
      connect_to_docker_network: true,
      autogenerate_domain: false,
    })
    expect(body.domains).toBeUndefined()
    expect(body.ports_exposes).toBeUndefined()
    expect(body.custom_labels).toBeUndefined()
    expect(body.install_command).toBeUndefined()
    expect(body.build_command).toBeUndefined()
    expect(body.start_command).toBeUndefined()
    expect(body.post_deployment_command).toBeUndefined()
    expect(body.docker_compose_raw).toBe('services:\n  web:\n    image: nginx:alpine\n')
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

  it('met à jour une application compose (build_pack, chemin, domaines par service)', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/app') && init?.method === 'PATCH') return json({ uuid: 'app' })
      throw new Error(`requête inattendue : ${init?.method ?? 'GET'} ${url}`)
    })
    const { updateApplication } = await loadModule()

    await expect(
      updateApplication('app', {
        buildPack: 'dockercompose',
        baseDirectory: '/apps/api',
        dockerComposeLocation: '/compose.yml',
        dockerComposeDomains: [{ name: 'web', domain: 'https://demo.example.com' }],
      }),
    ).resolves.toEqual({ ok: true })

    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body).toEqual({
      build_pack: 'dockercompose',
      base_directory: '/apps/api',
      docker_compose_location: '/compose.yml',
      docker_compose_domains: [{ name: 'web', domain: 'https://demo.example.com' }],
    })
    expect(body.domains).toBeUndefined()
    expect(body.ports_exposes).toBeUndefined()
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

describe('deployApplicationCommit', () => {
  const sha = 'b'.repeat(40)

  it('poste le commit sur /applications/{uuid}/rollback et lit deployment_uuid', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/applications/app/rollback')) {
        return json({ message: 'Rollback deployment queued.', deployment_uuid: 'dep-rb' })
      }
      throw new Error(url)
    })
    const { deployApplicationCommit } = await loadModule()

    await expect(deployApplicationCommit('app', sha)).resolves.toEqual({ deploymentId: 'dep-rb' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://coolify.test/api/v1/applications/app/rollback')
    expect(calls[0]?.init?.method).toBe('POST')
    // Seul `commit` est accepté : aucun changement de branche n'est envoyé.
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ commit: sha })
  })

  it('refuse un identifiant incomplet sans appeler l’API', async () => {
    const calls = mockFetch(() => json({}))
    const { deployApplicationCommit } = await loadModule()

    await expect(deployApplicationCommit('app', 'pending')).resolves.toEqual({
      error:
        'Commit de retour invalide : un identifiant complet de 40 caractères hexadécimaux est requis.',
    })
    expect(calls).toHaveLength(0)
  })

  it('traduit un refus 422 en message explicite (commit jamais livré)', async () => {
    mockFetch(() =>
      json(
        {
          message: 'Validation failed.',
          errors: {
            commit: ['The commit is not a rollback image or a successful deployment of this application.'],
          },
        },
        422,
      ),
    )
    const { deployApplicationCommit } = await loadModule()

    await expect(deployApplicationCommit('app', sha)).resolves.toEqual({
      error:
        'L’hébergement refuse ce retour arrière : ce commit n’a pas été déployé avec succès pour cette application, ou son image n’est plus disponible.',
    })
  })

  it('remonte le message quand aucun déploiement n’est renvoyé', async () => {
    mockFetch(() => json({ message: 'Deployment queue full.' }))
    const { deployApplicationCommit } = await loadModule()

    await expect(deployApplicationCommit('app', sha)).resolves.toEqual({
      error: 'Deployment queue full.',
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

describe('getApplicationLogs', () => {
  it('transmet service_name pour les logs d’un service compose', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/applications/app/logs')) return json({ logs: 'ligne queue' })
      throw new Error(url)
    })
    const { getApplicationLogs } = await loadModule()

    await expect(getApplicationLogs('app', 120, 'queue')).resolves.toEqual({ logs: 'ligne queue' })
    expect(calls[0]?.url).toContain('lines=120')
    expect(calls[0]?.url).toContain('service_name=queue')
    expect(calls[0]?.url).toContain('show_timestamps=true')
  })
})

describe('setComposeApplicationDomains', () => {
  it('n’envoie que docker_compose_domains, jamais domains', async () => {
    const calls = mockFetch((url) => {
      if (url.endsWith('/applications/app')) return json({ uuid: 'app' })
      throw new Error(url)
    })
    const { setComposeApplicationDomains } = await loadModule()

    await expect(
      setComposeApplicationDomains('app', [
        { name: 'web', domain: 'https://demo.example.com' },
      ]),
    ).resolves.toEqual({ ok: true })
    expect(calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      docker_compose_domains: [{ name: 'web', domain: 'https://demo.example.com' }],
    })
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
  it('envoie DELETE sur /applications/{uuid} en conservant les volumes par défaut', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/applications/app')) return new Response(null, { status: 204 })
      throw new Error(url)
    })
    const { deleteApplication } = await loadModule()

    await expect(deleteApplication('app')).resolves.toEqual({ ok: true })
    expect(calls[0]?.init?.method).toBe('DELETE')
    expect(calls[0]?.url).toContain('delete_volumes=false')
  })

  it('supprime explicitement les volumes quand demandé', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/applications/app')) return new Response(null, { status: 204 })
      throw new Error(url)
    })
    const { deleteApplication } = await loadModule()

    await expect(deleteApplication('app', { deleteVolumes: true })).resolves.toEqual({ ok: true })
    expect(calls[0]?.url).toContain('delete_volumes=true')
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

  it('considère un volume déjà existant côté Coolify comme idempotent', async () => {
    mockFetch((url, init) => {
      if ((init?.method ?? 'GET') === 'GET') return json({ persistent_storages: [] })
      return json({ message: 'Storage path already exists for this application.' }, 409)
    })
    const { ensureApplicationStorages } = await loadModule()

    await expect(
      ensureApplicationStorages('app', [{ name: 'eflex-storage', mountPath: '/app/storage' }]),
    ).resolves.toEqual({ created: 0, existing: 1 })
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

describe('sauvegardes de bases', () => {
  it('planifie une sauvegarde avec copie S3 et rétentions', async () => {
    const calls = mockFetch(() => json({ uuid: 'backup-1', message: 'ok' }, 201))
    const { createDatabaseBackup } = await loadModule()
    const result = await createDatabaseBackup('db-1', {
      frequency: '0 2 * * *',
      s3StorageUuid: 's3-1',
      retentionLocal: 3,
      retentionS3: 14,
    })
    expect(result).toEqual({ id: 'backup-1' })
    expect(calls[0]?.url).toBe('https://coolify.test/api/v1/databases/db-1/backups')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      frequency: '0 2 * * *',
      enabled: true,
      dump_all: false,
      save_s3: true,
      s3_storage_uuid: 's3-1',
      database_backup_retention_amount_s3: 14,
      database_backup_retention_amount_locally: 3,
    })
  })

  it('sans stockage S3, ne demande pas de copie hors serveur', async () => {
    const calls = mockFetch(() => json({ uuid: 'backup-2' }, 201))
    const { createDatabaseBackup } = await loadModule()
    await createDatabaseBackup('db-1', { frequency: 'daily', retentionLocal: 7, retentionS3: 14 })
    const body = JSON.parse(String(calls[0]?.init?.body))
    expect(body.save_s3).toBe(false)
    expect(body).not.toHaveProperty('s3_storage_uuid')
  })

  it('remonte une erreur lisible quand l’API refuse', async () => {
    mockFetch(() => json({ message: 'Validation failed.', errors: { frequency: ['Invalid cron'] } }, 422))
    const { createDatabaseBackup } = await loadModule()
    const result = await createDatabaseBackup('db-1', { frequency: 'x', retentionLocal: 1, retentionS3: 1 })
    expect('error' in result && result.error).toContain('Invalid cron')
  })

  it('lit les planifications et leurs exécutions, sans garder les messages internes', async () => {
    mockFetch(() =>
      json([
        {
          uuid: 'backup-1',
          frequency: '0 2 * * *',
          enabled: true,
          save_s3: 1,
          executions: [
            {
              uuid: 'e1',
              status: 'success',
              size: '2048',
              created_at: '2026-11-15T02:00:00Z',
              message: 'secret',
              filename: '/data/coolify/backups/databases/t-0/db-1/pg-dump-app-1.dmp',
              local_storage_deleted: true,
              s3_uploaded: 1,
            },
            { uuid: 'e2', status: 'failed', size: null, created_at: '2026-11-16T02:00:00Z' },
            { status: 'success' },
          ],
        },
        'invalide',
      ]),
    )
    const { listDatabaseBackups } = await loadModule()
    const result = await listDatabaseBackups('db-1')
    expect(result).toEqual([
      {
        id: 'backup-1',
        frequency: '0 2 * * *',
        enabled: true,
        saveS3: true,
        s3StorageId: null,
        executions: [
          { id: 'e2', status: 'failed', size: null, createdAt: '2026-11-16T02:00:00Z', filename: null, localDeleted: false, s3Uploaded: false },
          {
            id: 'e1',
            status: 'success',
            size: 2048,
            createdAt: '2026-11-15T02:00:00Z',
            filename: '/data/coolify/backups/databases/t-0/db-1/pg-dump-app-1.dmp',
            localDeleted: true,
            s3Uploaded: true,
          },
        ],
      },
    ])
  })

  it('lance une sauvegarde immédiate par PATCH backup_now', async () => {
    const calls = mockFetch(() => json({ message: 'updated' }))
    const { runDatabaseBackup } = await loadModule()
    expect(await runDatabaseBackup('db-1', 'backup-1')).toEqual({ ok: true })
    expect(calls[0]?.url).toBe('https://coolify.test/api/v1/databases/db-1/backups/backup-1')
    expect(calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ backup_now: true })
  })

  it('restaure depuis S3 sans « / » initial, en remplaçant les objets existants', async () => {
    const calls = mockFetch(() => json({ id: 42, status: 'queued', message: 'Database import queued.' }, 202))
    const { startDatabaseImport } = await loadModule()
    const result = await startDatabaseImport('db-1', { source: 's3', s3StorageUuid: 's3-1', path: '/data/coolify/backups/x.dmp' })
    expect(result).toEqual({ id: '42' })
    expect(calls[0]?.url).toBe('https://coolify.test/api/v1/databases/db-1/imports')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      source: 's3',
      s3_storage_uuid: 's3-1',
      path: 'data/coolify/backups/x.dmp',
      replace_existing: true,
      keep_owners: false,
    })
  })

  it('restaure depuis le fichier du serveur avec son chemin complet', async () => {
    const calls = mockFetch(() => json({ id: 7 }, 202))
    const { startDatabaseImport } = await loadModule()
    await startDatabaseImport('db-1', { source: 'server', path: '/data/coolify/backups/x.dmp' })
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ source: 'server', path: '/data/coolify/backups/x.dmp' })
  })

  it('remonte le refus de Coolify (import déjà en cours)', async () => {
    mockFetch(() => json({ message: 'A database import is already running.' }, 409))
    const { startDatabaseImport } = await loadModule()
    const result = await startDatabaseImport('db-1', { source: 'server', path: '/x.dmp' })
    expect('error' in result && result.error).toContain('already running')
  })

  it('traduit l’état d’une restauration', async () => {
    const { getDatabaseImportStatus } = await loadModule()
    mockFetch(() => json({ id: 42, status: 'in_progress', exit_code: null, finished_at: null }))
    expect(await getDatabaseImportStatus('db-1', '42')).toEqual({ state: 'running', finishedAt: null })
    mockFetch(() => json({ id: 42, status: 'finished', exit_code: 0, finished_at: '2026-11-16T10:00:00Z' }))
    expect(await getDatabaseImportStatus('db-1', '42')).toEqual({ state: 'finished', finishedAt: '2026-11-16T10:00:00Z' })
    mockFetch(() => json({ id: 42, status: 'finished', exit_code: 1, finished_at: '2026-11-16T10:00:00Z' }))
    expect((await getDatabaseImportStatus('db-1', '42') as { state: string }).state).toBe('failed')
    mockFetch(() => json({ id: 42, status: 'error', exit_code: 1 }))
    expect((await getDatabaseImportStatus('db-1', '42') as { state: string }).state).toBe('failed')
  })
})

describe('réglages avancés non écrasés au déploiement (#187)', () => {
  const ADVANCED = /^(health_check_|limits_|watch_paths)/

  it('la création d’une application depuis un dépôt n’envoie aucun champ de configuration avancée', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/public')) return json({ uuid: 'app' }, 201)
      return targetHandler(true)(url, init)
    })
    const { createApplication } = await loadModule()
    await createApplication({ name: 'demo', gitRepository: 'https://github.com/o/r', gitBranch: 'main', buildPack: 'nixpacks', portsExposes: '3000' })
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith('/applications/public'))?.init?.body))
    expect(Object.keys(body).filter((key) => ADVANCED.test(key))).toEqual([])
  })

  it('la création depuis une image Docker non plus', async () => {
    const calls = mockFetch((url, init) => {
      if (url.endsWith('/applications/dockerimage')) return json({ uuid: 'app' }, 201)
      return targetHandler(true)(url, init)
    })
    const { createDockerImageApplication } = await loadModule()
    await createDockerImageApplication({ name: 'demo', dockerRegistryImageName: 'nginx:1.27', portsExposes: '80' })
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith('/applications/dockerimage'))?.init?.body))
    expect(Object.keys(body).filter((key) => ADVANCED.test(key))).toEqual([])
  })

  it('la mise à jour des commandes de build ne touche ni santé, ni limites, ni dossiers surveillés', async () => {
    const calls = mockFetch(() => json({ message: 'ok' }))
    const { updateApplication } = await loadModule()
    await updateApplication('app-1', { buildCommand: 'npm run build', startCommand: 'npm start', portsExposes: '3000', baseDirectory: '/' })
    const patch = calls.find((c) => (c.init?.method ?? 'GET') === 'PATCH')
    expect(patch).toBeDefined()
    expect(Object.keys(JSON.parse(String(patch?.init?.body))).filter((key) => ADVANCED.test(key))).toEqual([])
  })
})
