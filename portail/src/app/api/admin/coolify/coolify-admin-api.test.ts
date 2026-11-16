import { describe, expect, it, vi } from 'vitest'

// Les routes de pilotage Coolify sont réservées aux administrateurs : 404 pour tous les autres,
// avant tout appel à Coolify (le fetch global échoue s'il est appelé).
const state = vi.hoisted(() => ({ session: null as unknown }))
vi.mock('@/lib/session', () => ({ getSession: async () => state.session }))
vi.mock('@/lib/audit', () => ({ audit: async () => undefined }))

const params = (value: Record<string, string>) => ({ params: Promise.resolve(value) })
const ROUTES: Array<{ name: string; call: () => Promise<Response> }> = [
  { name: 'GET servers', call: async () => (await import('./servers/route')).GET() },
  { name: 'GET server', call: async () => (await import('./servers/[uuid]/route')).GET(new Request('http://x'), params({ uuid: 'srv' })) },
  { name: 'POST server', call: async () => (await import('./servers/[uuid]/route')).POST(new Request('http://x', { method: 'POST', body: '{"action":"proxy-restart"}' }), params({ uuid: 'srv' })) },
  { name: 'PATCH server', call: async () => (await import('./servers/[uuid]/route')).PATCH(new Request('http://x', { method: 'PATCH', body: '{"threshold":80}' }), params({ uuid: 'srv' })) },
  { name: 'GET s3', call: async () => (await import('./s3-storages/route')).GET() },
  { name: 'POST s3', call: async () => (await import('./s3-storages/route')).POST(new Request('http://x', { method: 'POST', body: '{}' })) },
  { name: 'POST s3 validate', call: async () => (await import('./s3-storages/[storageId]/validate/route')).POST(new Request('http://x', { method: 'POST' }), params({ storageId: 's3' })) },
  { name: 'GET vulnerabilities', call: async () => (await import('./vulnerabilities/route')).GET() },
  { name: 'GET audit', call: async () => (await import('./audit/route')).GET(new Request('http://x/api/admin/coolify/audit')) },
  { name: 'GET deployments', call: async () => (await import('./deployments/route')).GET() },
  { name: 'GET ops-tools', call: async () => (await import('./ops-tools/route')).GET() },
  { name: 'POST ops-tools', call: async () => (await import('./ops-tools/route')).POST(new Request('http://x', { method: 'POST', body: '{"action":"install","tool":"logs"}' })) },
]

const user = { user: { id: 'u1', email: 'simple@exemple.fr', role: 'user', banned: false }, session: {} }
const admin = { user: { id: 'a1', email: 'admin@exemple.fr', role: 'admin', banned: false }, session: {} }

describe('API pilotage Coolify : accès réservé', () => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Coolify ne doit pas être appelé')
  }))

  it.each(ROUTES)('$name : 404 pour un visiteur anonyme', async (route) => {
    state.session = null
    expect((await route.call()).status).toBe(404)
  })

  it.each(ROUTES)('$name : 404 pour un utilisateur non administrateur', async (route) => {
    state.session = user
    expect((await route.call()).status).toBe(404)
  })

  it.each(ROUTES)('$name : 404 pour un administrateur suspendu', async (route) => {
    state.session = { user: { ...admin.user, banned: true }, session: {} }
    expect((await route.call()).status).toBe(404)
  })
})

describe('API pilotage Coolify : validation', () => {
  it('refuse un identifiant de serveur qui sortirait du chemin prévu', async () => {
    state.session = admin
    const { GET } = await import('./servers/[uuid]/route')
    expect((await GET(new Request('http://x'), params({ uuid: '../applications' }))).status).toBe(404)
  })

  it('refuse une action inconnue et un seuil de disque hors bornes', async () => {
    state.session = admin
    const route = await import('./servers/[uuid]/route')
    expect((await route.POST(new Request('http://x', { method: 'POST', body: '{"action":"delete"}' }), params({ uuid: 'srv' }))).status).toBe(400)
    expect((await route.PATCH(new Request('http://x', { method: 'PATCH', body: '{"threshold":5}' }), params({ uuid: 'srv' }))).status).toBe(400)
    expect((await route.PATCH(new Request('http://x', { method: 'PATCH', body: '{}' }), params({ uuid: 'srv' }))).status).toBe(400)
  })

  it('exige une adresse S3 en https', async () => {
    state.session = admin
    const { POST } = await import('./s3-storages/route')
    const body = { name: 'B2', endpoint: 'http://s3.test', bucket: 'bucket', region: 'eu', key: 'k', secret: 's' }
    const response = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('https://')
  })

  it('outils d’exploitation : refuse un outil inconnu et une clé d’agent invalide', async () => {
    state.session = admin
    const { POST } = await import('./ops-tools/route')
    const post = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }))
    expect((await post({ action: 'install', tool: 'grafana' })).status).toBe(400)
    expect((await post({ action: 'agent-key', tool: 'metrics', key: 'rm -rf /', token: 'abcdefgh' })).status).toBe(400)
    expect((await post({ action: 'agent-key', tool: 'logs', key: 'ssh-ed25519 AAAA', token: 'abcdefgh' })).status).toBe(400)
  })
})
