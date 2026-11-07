import { describe, expect, it } from 'vitest'
import {
  CoolifyClient,
  CoolifyError,
  loadCoolifyConfig,
  mapDeploymentStatus,
  tailLogs,
  type CoolifyConfig,
} from '@/lib/coolify'
import { fakeCoolify } from '@/lib/test-support/fake-coolify'

const config: CoolifyConfig = {
  apiUrl: 'https://coolify.exemple.fr/api/v1',
  token: 'tok_test',
  serverUuid: 'srv_abc123',
  projectUuid: 'prj_abc123',
  environmentName: 'production',
  appsDomain: 'apps.exemple.fr',
}

const validApp = { name: 'a', git_repository: 'https://github.com/o/r', git_branch: 'main', build_pack: 'nixpacks', ports_exposes: '3000' }
const fail = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as CoolifyError)

describe('loadCoolifyConfig', () => {
  const base = {
    COOLIFY_API_URL: 'https://coolify.exemple.fr/api/v1',
    COOLIFY_API_TOKEN: 'tok',
    COOLIFY_SERVER_UUID: 'srv_abc123',
    COOLIFY_PROJECT_UUID: 'prj_abc123',
  }

  it('applique les valeurs par défaut', () => {
    const c = loadCoolifyConfig(base)
    expect(c.environmentName).toBe('production')
    expect(c.appsDomain).toBeUndefined()
    expect(c.destinationUuid).toBeUndefined()
  })

  it('liste précisément les variables manquantes', () => {
    expect(() => loadCoolifyConfig({})).toThrow(/COOLIFY_API_URL, COOLIFY_API_TOKEN, COOLIFY_SERVER_UUID, COOLIFY_PROJECT_UUID/)
    expect(() => loadCoolifyConfig({ ...base, COOLIFY_PROJECT_UUID: '  ' })).toThrow(/variable manquante COOLIFY_PROJECT_UUID/)
  })

  it.each([
    ['https://coolify.exemple.fr', 'https://coolify.exemple.fr/api/v1'],
    ['https://coolify.exemple.fr/', 'https://coolify.exemple.fr/api/v1'],
    ['https://coolify.exemple.fr/api/v1', 'https://coolify.exemple.fr/api/v1'],
    ['https://coolify.exemple.fr/api/v1/', 'https://coolify.exemple.fr/api/v1'],
    ['http://localhost:8000', 'http://localhost:8000/api/v1'],
  ])('normalise l’URL %s', (input, expected) => {
    expect(loadCoolifyConfig({ ...base, COOLIFY_API_URL: input }).apiUrl).toBe(expected)
  })

  it.each(['pas une url', 'ftp://coolify.exemple.fr', 'javascript:alert(1)'])('refuse l’URL %j', (url) => {
    expect(() => loadCoolifyConfig({ ...base, COOLIFY_API_URL: url })).toThrow(CoolifyError)
  })

  it('refuse des identifiants qui ne ressemblent pas à des UUID Coolify', () => {
    expect(() => loadCoolifyConfig({ ...base, COOLIFY_SERVER_UUID: '../etc' })).toThrow(/COOLIFY_SERVER_UUID/)
  })

  it('accepte *.domaine et refuse un domaine invalide', () => {
    expect(loadCoolifyConfig({ ...base, COOLIFY_APPS_DOMAIN: '*.Apps.Exemple.fr' }).appsDomain).toBe('apps.exemple.fr')
    expect(() => loadCoolifyConfig({ ...base, COOLIFY_APPS_DOMAIN: 'apps exemple' })).toThrow(/COOLIFY_APPS_DOMAIN/)
    expect(() => loadCoolifyConfig({ ...base, COOLIFY_APPS_DOMAIN: 'a.fr/evil' })).toThrow(/COOLIFY_APPS_DOMAIN/)
  })
})

describe('CoolifyClient', () => {
  it('crée une application avec l’emplacement et le jeton, et lit { uuid } sans enveloppe', async () => {
    const fake = fakeCoolify()
    const client = new CoolifyClient({ ...config, destinationUuid: 'dst_abc123' }, fake.fetch)
    const { uuid } = await client.createApplication(validApp)

    expect(uuid).toBe('app00001')
    const call = fake.calls[0]!
    expect(call).toMatchObject({ method: 'POST', path: '/applications/public', authorization: 'Bearer tok_test' })
    expect(call.body).toMatchObject({
      ...validApp,
      project_uuid: 'prj_abc123',
      server_uuid: 'srv_abc123',
      environment_name: 'production',
      destination_uuid: 'dst_abc123',
    })
  })

  it('transmet les variables telles quelles (is_literal) : un « $ » n’est pas interprété', async () => {
    const fake = fakeCoolify()
    const client = new CoolifyClient(config, fake.fetch)
    const { uuid } = await client.createApplication(validApp)
    await client.setEnv(uuid, { key: 'DB_PASSWORD', value: 'pa$$w0rd${X}' })

    expect(fake.apps.get(uuid)?.envs[0]).toEqual({ key: 'DB_PASSWORD', value: 'pa$$w0rd${X}', is_literal: true })
    expect(fake.calls.at(-1)?.path).toBe(`/applications/${uuid}/envs`)
  })

  it('déclenche un déploiement et retourne son identifiant', async () => {
    const fake = fakeCoolify()
    const client = new CoolifyClient(config, fake.fetch)
    const { uuid } = await client.createApplication(validApp)
    const { deploymentUuid } = await client.deploy(uuid)

    expect(deploymentUuid).toBe('dep00001')
    expect(fake.calls.at(-1)).toMatchObject({ method: 'POST', path: '/deploy', search: `?uuid=${uuid}` })
  })

  it('signale un déploiement que Coolify n’a pas démarré', async () => {
    const fake = fakeCoolify({ failDeployFor: 'a' })
    const client = new CoolifyClient(config, fake.fetch)
    const { uuid } = await client.createApplication(validApp)
    const err = await fail(client.deploy(uuid))
    expect(err?.message).toMatch(/n'a pas démarré de déploiement \(Application is not ready\.\)/)
  })

  it('lit le statut, le commit et les journaux d’un déploiement', async () => {
    const fake = fakeCoolify({ deploymentStatus: 'finished', deploymentCommit: 'abc1234', deploymentLogs: '[]' })
    const client = new CoolifyClient(config, fake.fetch)
    const { uuid } = await client.createApplication(validApp)
    const { deploymentUuid } = await client.deploy(uuid)
    expect(await client.getDeployment(deploymentUuid)).toEqual({ status: 'finished', commit: 'abc1234', logs: '[]' })
  })

  it('supprime une application', async () => {
    const fake = fakeCoolify()
    const client = new CoolifyClient(config, fake.fetch)
    const { uuid } = await client.createApplication(validApp)
    await client.deleteApplication(uuid)
    expect(fake.apps.get(uuid)?.deleted).toBe(true)
    expect(fake.calls.at(-1)?.search).toContain('delete_configurations=true')
  })

  it('ping : /health répond « OK » en texte, pas en JSON', async () => {
    const client = new CoolifyClient(config, fakeCoolify().fetch)
    expect(await client.ping()).toBe(true)
    expect(await new CoolifyClient(config, fakeCoolify({ down: true }).fetch).ping()).toBe(false)
    expect(await new CoolifyClient({ ...config, token: 'mauvais' }, fakeCoolify().fetch).ping()).toBe(false)
  })

  it('domainFor : sous-domaine du projet, ou rien sans COOLIFY_APPS_DOMAIN', () => {
    expect(new CoolifyClient(config).domainFor('mon-projet')).toBe('mon-projet.apps.exemple.fr')
    expect(new CoolifyClient({ ...config, appsDomain: undefined }).domainFor('mon-projet')).toBeUndefined()
  })

  describe('erreurs en français, sans jamais exposer le jeton', () => {
    it('401 : jeton refusé', async () => {
      const client = new CoolifyClient({ ...config, token: 'secret_token_xyz' }, fakeCoolify().fetch)
      const err = await fail(client.createApplication(validApp))
      expect(err?.status).toBe(401)
      expect(err?.message).toMatch(/jeton/)
      expect(err?.message).not.toContain('secret_token_xyz')
    })

    it('422 : détaille le champ refusé', async () => {
      const err = await fail(new CoolifyClient(config, fakeCoolify().fetch).createApplication({ ...validApp, fqdn: 'x.fr' }))
      expect(err?.status).toBe(422)
      expect(err?.message).toMatch(/Coolify a refusé la configuration.*fqdn : This field is not allowed/)
    })

    it('404 : oriente vers les variables de configuration', async () => {
      const fake = fakeCoolify()
      const err = await fail(new CoolifyClient(config, fake.fetch).setEnv('inconnu123', { key: 'A', value: '1' }))
      expect(err?.status).toBe(404)
      expect(err?.message).toMatch(/COOLIFY_SERVER_UUID/)
    })

    it('Coolify éteint', async () => {
      const err = await fail(new CoolifyClient(config, fakeCoolify({ down: true }).fetch).createApplication(validApp))
      expect(err?.message).toMatch(/injoignable/)
      expect(err?.message).not.toContain('tok_test')
    })

    it('un identifiant qui ressemble à un chemin est refusé avant tout appel', async () => {
      const fake = fakeCoolify()
      const client = new CoolifyClient(config, fake.fetch)
      for (const bad of ['../../servers', 'a/b', 'x?y=1', '']) {
        expect((await fail(client.deploy(bad)))?.message).toMatch(/Identifiant Coolify invalide/)
        expect((await fail(client.deleteApplication(bad)))?.message).toMatch(/Identifiant Coolify invalide/)
      }
      expect(fake.calls).toHaveLength(0)
    })
  })
})

describe('mapDeploymentStatus', () => {
  it.each([
    ['queued', 'pending'],
    ['in_progress', 'building'],
    ['finished', 'live'],
    ['failed', 'failed'],
    ['cancelled-by-user', 'rollbacked'],
    ['inconnu', 'pending'],
  ])('%s → %s', (input, expected) => expect(mapDeploymentStatus(input)).toBe(expected))
})

describe('tailLogs', () => {
  const entry = (output: string, hidden = false) => ({ command: null, output, type: 'stdout', hidden, timestamp: 't' })

  it('garde les dernières lignes visibles', () => {
    const logs = JSON.stringify([entry('début'), entry('secret caché', true), entry('étape 2\nerreur : build cassé')])
    expect(tailLogs(logs, 2)).toBe('étape 2\nerreur : build cassé')
    expect(tailLogs(logs)).not.toContain('secret caché')
  })

  it('accepte du texte brut et le tronque', () => {
    expect(tailLogs('a\n\nb\nc', 2)).toBe('b\nc')
    expect(tailLogs('x'.repeat(5_000)).length).toBeLessThanOrEqual(2_000)
    expect(tailLogs(undefined)).toBe('')
  })
})
