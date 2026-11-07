import { describe, expect, it } from 'vitest'
import type { BuildPlan } from '@eflex/detector'
import { CoolifyClient, type CoolifyConfig } from '@/lib/coolify'
import { DeployError, provisionAndDeploy, syncDeployment } from '@/lib/deployer'
import { fakeCoolify, type FakeCoolifyOptions } from '@/lib/test-support/fake-coolify'

const config: CoolifyConfig = {
  apiUrl: 'https://coolify.exemple.fr/api/v1',
  token: 'tok_test',
  serverUuid: 'srv_abc123',
  projectUuid: 'prj_abc123',
  environmentName: 'production',
  appsDomain: 'apps.exemple.fr',
}

const setup = (options?: FakeCoolifyOptions) => {
  const fake = fakeCoolify(options)
  return { fake, client: new CoolifyClient(config, fake.fetch) }
}

const next: BuildPlan = { version: 1, framework: 'nextjs', runtime: 'node@22', root: '', port: 3000, install: 'npm ci', build: 'next build', start: 'next start' }
const laravel: BuildPlan = {
  version: 1,
  framework: 'laravel',
  runtime: 'php@8.3',
  root: '',
  port: 80,
  install: 'composer install',
  services: { app: { command: 'php-fpm' }, web: { command: 'nginx' }, queue: { command: 'php artisan queue:work' }, scheduler: { command: 'php artisan schedule:work' } },
  postDeploy: ['php artisan migrate --force'],
}
const input = (plan: BuildPlan, env: Array<{ key: string; value: string }> = []) => ({
  plan,
  slug: 'mon-projet',
  repoUrl: 'https://github.com/acme/app',
  branch: 'main',
  env,
})
const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as DeployError)

describe('provisionAndDeploy', () => {
  it('Next.js : une application, ses variables, un déploiement', async () => {
    const { fake, client } = setup()
    const result = await provisionAndDeploy(client, input(next, [{ key: 'API_KEY', value: 'abc' }]))

    expect(result).toMatchObject({ appId: 'app00001', workers: {}, deploymentUuid: 'dep00001', domain: 'mon-projet.apps.exemple.fr' })
    expect(fake.apps.size).toBe(1)
    expect(fake.apps.get('app00001')?.envs.map((e) => e.key)).toEqual(['API_KEY'])
    expect(fake.apps.get('app00001')?.payload).toMatchObject({ domains: 'https://mon-projet.apps.exemple.fr', start_command: 'next start' })
  })

  it('les variables sont créées avant le premier déploiement', async () => {
    const { fake, client } = setup()
    await provisionAndDeploy(client, input(next, [{ key: 'A', value: '1' }, { key: 'B', value: '2' }]))
    const order = fake.calls.map((c) => `${c.method} ${c.path}`)
    expect(order).toEqual(['POST /applications/public', 'POST /applications/app00001/envs', 'POST /applications/app00001/envs', 'POST /deploy'])
  })

  it('Laravel : application web + workers, mêmes variables partout, tout est déployé', async () => {
    const { fake, client } = setup()
    const result = await provisionAndDeploy(client, input(laravel, [{ key: 'APP_KEY', value: 'base64:xyz' }]))

    expect(result.appId).toBe('app00001')
    expect(result.workers).toEqual({ queue: 'app00002', scheduler: 'app00003' })
    for (const app of fake.apps.values()) {
      expect(app.envs.map((e) => e.key)).toEqual(['APP_KEY'])
      expect(app.deployments).toHaveLength(1)
    }
    expect(fake.apps.get('app00001')?.payload.post_deployment_command).toBe('php artisan migrate --force')
    expect(fake.apps.get('app00002')?.payload.start_command).toBe('php artisan queue:work')
  })

  it('le déploiement retourné est celui de l’application web', async () => {
    const { client } = setup()
    expect((await provisionAndDeploy(client, input(laravel))).deploymentUuid).toBe('dep00001')
  })

  it('les variables de l’utilisateur l’emportent sur celles du plan', async () => {
    const { fake, client } = setup()
    const plan = { ...next, buildEnv: { PUBLIC_URL: 'https://plan.fr', MODE: 'plan' } }
    await provisionAndDeploy(client, input(plan, [{ key: 'MODE', value: 'user' }]))
    const envs = Object.fromEntries((fake.apps.get('app00001')?.envs ?? []).map((e) => [e.key, e.value]))
    expect(envs).toEqual({ PUBLIC_URL: 'https://plan.fr', MODE: 'user' })
  })

  it('sans COOLIFY_APPS_DOMAIN : pas de domaine demandé', async () => {
    const fake = fakeCoolify()
    const client = new CoolifyClient({ ...config, appsDomain: undefined }, fake.fetch)
    const result = await provisionAndDeploy(client, input(next))
    expect(result.domain).toBeUndefined()
    expect(fake.apps.get('app00001')?.payload).not.toHaveProperty('domains')
  })

  it('remonte les limites du déploiement (avertissements)', async () => {
    const { client } = setup()
    const result = await provisionAndDeploy(client, input({ ...laravel, volumes: ['storage'] }))
    expect(result.warnings.join(' ')).toMatch(/storage/)
  })

  describe('échec : rien ne reste côté Coolify', () => {
    it('création d’une application refusée : les précédentes sont supprimées', async () => {
      const { fake, client } = setup({ failCreateAt: 2 })
      const err = await fail(provisionAndDeploy(client, input(laravel)))

      expect(err).toBeInstanceOf(DeployError)
      expect(err?.message).toMatch(/Coolify a refusé la configuration.*Domain already in use/)
      expect([...fake.apps.values()].every((a) => a.deleted)).toBe(true)
      expect(fake.apps.size).toBe(1)
      expect([...fake.apps.values()].some((a) => a.deployments.length > 0)).toBe(false)
    })

    it('variable refusée : le nom de la variable est indiqué et l’application supprimée', async () => {
      const { fake, client } = setup({ failEnvKey: 'BAD' })
      const err = await fail(provisionAndDeploy(client, input(next, [{ key: 'OK', value: '1' }, { key: 'BAD', value: '2' }])))

      expect(err?.message).toMatch(/Variable « BAD » non transmise/)
      expect(fake.apps.get('app00001')?.deleted).toBe(true)
      expect(fake.calls.some((c) => c.path === '/deploy')).toBe(false)
    })

    it('déploiement non démarré : tout est supprimé', async () => {
      const { fake, client } = setup({ failDeployFor: 'mon-projet-queue' })
      const err = await fail(provisionAndDeploy(client, input(laravel)))

      expect(err?.message).toMatch(/n'a pas démarré de déploiement/)
      expect([...fake.apps.values()].every((a) => a.deleted)).toBe(true)
      expect(fake.apps.size).toBe(3)
    })

    it('Coolify éteint : message clair, rien à nettoyer', async () => {
      const { client } = setup({ down: true })
      const err = await fail(provisionAndDeploy(client, input(next)))
      expect(err?.message).toMatch(/injoignable/)
      expect(err?.leftovers).toEqual([])
    })

    it('nettoyage impossible : les applications restantes sont nommées pour qu’on les supprime à la main', async () => {
      const fake = fakeCoolify({ failEnvKey: 'BAD' })
      // Coolify devient injoignable au moment du nettoyage.
      const flaky = (async (url: RequestInfo | URL, init?: RequestInit) =>
        (init?.method ?? 'GET') === 'DELETE' ? Promise.reject(new TypeError('fetch failed')) : fake.fetch(url, init)) as typeof fetch
      const client = new CoolifyClient(config, flaky)

      const err = await fail(provisionAndDeploy(client, input(next, [{ key: 'BAD', value: '1' }])))
      expect(err?.leftovers).toEqual(['app00001'])
      expect(err?.message).toMatch(/Nettoyage incomplet.*app00001/)
    })
  })
})

describe('syncDeployment', () => {
  const running = { status: 'building', coolifyBuildId: 'dep00001' }
  const deployed = async (options: FakeCoolifyOptions) => {
    const { fake, client } = setup(options)
    await provisionAndDeploy(client, input(next))
    return { fake, client }
  }

  it('terminé → en ligne, avec le vrai commit', async () => {
    const { client } = await deployed({ deploymentStatus: 'finished', deploymentCommit: 'abc1234def5678' })
    expect(await syncDeployment(client, running)).toEqual({ status: 'live', commitSha: 'abc1234def5678' })
  })

  it('échec → statut « failed » et dernières lignes du journal', async () => {
    const logs = JSON.stringify([{ output: 'Installing…', hidden: false }, { output: 'npm ERR! build failed', hidden: false }])
    const { client } = await deployed({ deploymentStatus: 'failed', deploymentLogs: logs })
    expect(await syncDeployment(client, running)).toEqual({ status: 'failed', logsSummary: 'Installing…\nnpm ERR! build failed' })
  })

  it('échec sans journal : message de repli', async () => {
    const { client } = await deployed({ deploymentStatus: 'failed' })
    expect((await syncDeployment(client, running))?.logsSummary).toMatch(/journaux indisponibles/)
  })

  it('ignore un commit qui n’est pas un SHA (« HEAD »)', async () => {
    const { client } = await deployed({ deploymentStatus: 'finished', deploymentCommit: 'HEAD' })
    expect(await syncDeployment(client, running)).toEqual({ status: 'live' })
  })

  it('rien à changer : null', async () => {
    const { client } = await deployed({ deploymentStatus: 'in_progress' })
    expect(await syncDeployment(client, running)).toBeNull()
  })

  it('un déploiement déjà terminé ou sans identifiant n’est pas interrogé', async () => {
    const { fake, client } = await deployed({ deploymentStatus: 'finished' })
    const before = fake.calls.length
    expect(await syncDeployment(client, { status: 'live', coolifyBuildId: 'dep00001' })).toBeNull()
    expect(await syncDeployment(client, { status: 'failed', coolifyBuildId: 'dep00001' })).toBeNull()
    expect(await syncDeployment(client, { status: 'building', coolifyBuildId: null })).toBeNull()
    expect(fake.calls.length).toBe(before)
  })

  it('Coolify injoignable : le statut précédent est conservé, pas d’échec inventé', async () => {
    const offline = new CoolifyClient(config, fakeCoolify({ down: true }).fetch)
    expect(await syncDeployment(offline, running)).toBeNull()
  })
})
