import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  services: [] as Array<{ id: string; name: string; status: string | null }>,
  created: [] as Array<Record<string, string>>,
  replaced: [] as Array<{ id: string; compose: string }>,
  variables: [] as Array<{ id: string; vars: Record<string, string> }>,
}))

vi.mock('@/lib/coolify', () => ({
  resolveTarget: async () => ({ serverUuid: 'srv', projectUuid: 'proj', environmentName: 'production' }),
}))
vi.mock('@/lib/coolify-admin', () => ({
  listCoolifyServices: async () => mock.services,
  createComposeService: async (input: Record<string, string>) => {
    mock.created.push(input)
    return { id: 'svc-new' }
  },
  replaceServiceCompose: async (id: string, compose: string) => {
    mock.replaced.push({ id, compose })
    return { ok: true, message: null }
  },
  setServiceVariables: async (id: string, vars: Record<string, string>) => {
    mock.variables.push({ id, vars })
    return { ok: true, message: null }
  },
}))

beforeEach(() => {
  mock.services = []
  mock.created.length = 0
  mock.replaced.length = 0
  mock.variables.length = 0
  vi.stubEnv('PORTAL_DOMAIN', 'eflex.app')
})
afterEach(() => vi.unstubAllEnvs())

describe('installation des outils d’exploitation', () => {
  it('installe sur la cible Coolify et renvoie l’accès une seule fois', async () => {
    const { installOpsTool } = await import('@/lib/ops-tools-install')
    const result = await installOpsTool('uptime')
    expect(result).toMatchObject({ url: 'https://uptime.eflex.app', user: 'admin' })
    const password = (result as { password: string }).password
    expect(password).toHaveLength(24)
    expect(mock.created[0]).toMatchObject({ name: 'eflex-ops-uptime', serverUuid: 'srv', projectUuid: 'proj', environmentName: 'production' })
    expect(mock.created[0]?.compose).not.toContain(password)
  })

  it('refuse une seconde installation', async () => {
    mock.services = [{ id: 'svc-1', name: 'eflex-ops-logs', status: 'running:healthy' }]
    const { installOpsTool } = await import('@/lib/ops-tools-install')
    expect(await installOpsTool('logs')).toMatchObject({ status: 409 })
    expect(mock.created).toHaveLength(0)
  })

  it('exige le domaine de la plateforme', async () => {
    vi.stubEnv('PORTAL_DOMAIN', '')
    const { installOpsTool } = await import('@/lib/ops-tools-install')
    expect(await installOpsTool('logs')).toMatchObject({ status: 409 })
  })

  it('génère un nouveau mot de passe sur l’outil installé', async () => {
    mock.services = [{ id: 'svc-1', name: 'eflex-ops-metrics', status: 'running' }]
    const { rotateOpsPassword } = await import('@/lib/ops-tools-install')
    const result = await rotateOpsPassword('metrics')
    expect(result).toMatchObject({ url: 'https://metrics.eflex.app' })
    expect(mock.replaced[0]?.id).toBe('svc-1')
    expect(await rotateOpsPassword('uptime')).toMatchObject({ status: 404 })
  })

  it('relie l’agent Beszel au hub', async () => {
    mock.services = [{ id: 'svc-2', name: 'eflex-ops-metrics', status: 'running' }]
    const { setBeszelAgentKey } = await import('@/lib/ops-tools-install')
    expect(await setBeszelAgentKey('ssh-ed25519 AAAA', 'tok')).toEqual({ ok: true })
    expect(mock.variables).toEqual([{ id: 'svc-2', vars: { KEY: 'ssh-ed25519 AAAA', TOKEN: 'tok' } }])
  })

  it('liste l’état et l’adresse de chaque outil', async () => {
    mock.services = [{ id: 'svc-1', name: 'eflex-ops-uptime', status: 'running:healthy' }]
    const { listOpsTools } = await import('@/lib/ops-tools-install')
    const result = await listOpsTools()
    if ('error' in result) throw new Error(result.error)
    expect(result.tools.map((tool) => [tool.id, tool.installed, tool.url])).toEqual([
      ['uptime', true, 'https://uptime.eflex.app'],
      ['metrics', false, 'https://metrics.eflex.app'],
      ['logs', false, 'https://logs.eflex.app'],
    ])
  })

  it('applique le domaine dédié et le filtre d’adresses à l’installation', async () => {
    vi.stubEnv('OPS_ROOT_DOMAIN', 'ops.eflex.app')
    vi.stubEnv('OPS_PRIVATE_NETWORK', 'tailscale')
    const { installOpsTool, listOpsTools } = await import('@/lib/ops-tools-install')
    expect(await installOpsTool('logs')).toMatchObject({ url: 'https://logs.ops.eflex.app' })
    expect(mock.created[0]?.compose).toContain('ipallowlist.sourcerange=100.64.0.0/10,fd7a:115c:a1e0::/48')
    const list = await listOpsTools()
    if ('error' in list) throw new Error(list.error)
    expect(list.access).toMatchObject({ privateNetwork: 'tailscale', publicAccess: false })
  })
})
