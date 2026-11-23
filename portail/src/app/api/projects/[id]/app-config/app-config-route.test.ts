import { beforeEach, describe, expect, it, vi } from 'vitest'

// La route est protégée (session, projet de l'organisation, droit de gestion) ; ici on teste la validation des
// valeurs envoyées à Coolify (audit de sécurité 2026-11, N1 et N4), avec Coolify simulé.
const state = vi.hoisted(() => ({
  patches: [] as Array<Record<string, unknown>>,
  current: { limitsMemory: '1g', limitsCpus: '', limitsMemorySwap: '', limitsMemoryReservation: '' } as Record<string, unknown>,
}))

vi.mock('@/lib/session', () => ({ getSession: async () => ({ user: { id: 'u1' }, session: {} }) }))
vi.mock('@/lib/organizations', () => ({
  canManageProjects: () => true,
  resolveOrganization: async () => ({ organizationId: 'o1', role: 'owner' }),
}))
// Plan Pro : plafond de 2 Go / 2 CPU, identique au plafond global par défaut des tests.
vi.mock('@/lib/billing', () => ({ effectivePlan: async () => ({ id: 'pro' }) }))
vi.mock('@/lib/tenant', () => ({
  requireManagedProject: async () => ({
    org: { organizationId: 'o1', role: 'owner' },
    project: { id: 'p1', organizationId: 'o1', apps: [{ id: 'a1', name: 'web', coolifyAppId: 'coolify-1', position: 0 }] },
  }),
}))
vi.mock('@/lib/coolify', () => ({
  getApplicationAdvancedConfig: async () => state.current,
  updateApplicationAdvancedConfig: async (_id: string, patch: Record<string, unknown>) => {
    state.patches.push(patch)
    return { ok: true }
  },
}))

async function patch(config: Record<string, unknown>) {
  const { PATCH } = await import('./route')
  const response = await PATCH(
    new Request('http://x', { method: 'PATCH', body: JSON.stringify({ config }) }),
    { params: Promise.resolve({ id: 'p1' }) },
  )
  return { status: response.status, body: (await response.json()) as { error?: string } }
}

beforeEach(() => {
  state.patches.length = 0
  state.current = { limitsMemory: '1g', limitsCpus: '', limitsMemorySwap: '', limitsMemoryReservation: '' }
})

describe('PATCH app-config : limites de ressources', () => {
  it('refuse une mémoire au-dessus du plafond (2 Go par défaut)', async () => {
    const result = await patch({ limitsMemory: '16g' })
    expect(result.status).toBe(400)
    expect(result.body.error).toContain('Mémoire')
    expect(state.patches).toHaveLength(0)
  })

  it('refuse des processeurs hors plafond et un format invalide', async () => {
    expect((await patch({ limitsCpus: '64' })).status).toBe(400)
    expect((await patch({ limitsCpus: 'beaucoup' })).status).toBe(400)
    expect(state.patches).toHaveLength(0)
  })

  it('ne retire jamais une limite : « 0 » et vide ne sont pas envoyés', async () => {
    const result = await patch({ limitsMemory: '0', limitsCpus: '', limitsMemorySwap: '0', healthCheckEnabled: true })
    expect(result.status).toBe(200)
    const sent = state.patches[0]!
    expect(sent.healthCheckEnabled).toBe(true)
    for (const key of ['limitsMemory', 'limitsCpus', 'limitsMemorySwap', 'limitsMemoryReservation']) expect(sent[key]).toBeUndefined()
  })

  it('accepte une limite valide et la transmet', async () => {
    const result = await patch({ limitsMemory: '512m', limitsCpus: '1.5' })
    expect(result.status).toBe(200)
    expect(state.patches[0]).toMatchObject({ limitsMemory: '512m', limitsCpus: '1.5' })
  })

  it('une valeur inchangée n’est pas renvoyée, même au-dessus du plafond actuel', async () => {
    state.current = { ...state.current, limitsMemory: '8g' } // limite historique, supérieure au plafond
    const result = await patch({ limitsMemory: '8g', healthCheckEnabled: false })
    expect(result.status).toBe(200)
    expect(state.patches[0]!.limitsMemory).toBeUndefined()
    // mais la modifier au-dessus du plafond reste refusé
    expect((await patch({ limitsMemory: '9g' })).status).toBe(400)
  })
})

describe('PATCH app-config : contrôle de santé', () => {
  it.each([
    ['healthCheckPath', '/ok; rm -rf /'],
    ['healthCheckPath', 'sans-slash'],
    ['healthCheckMethod', 'DELETE'],
    ['healthCheckPort', '70000'],
    ['healthCheckHost', 'http://interne'],
    ['healthCheckResponseText', 'a$(id)'],
    ['watchPaths', 'src/**; id'],
  ])('refuse %s = %s', async (field, value) => {
    const result = await patch({ [field]: value })
    expect(result.status).toBe(400)
    expect(state.patches).toHaveLength(0)
  })

  it('accepte une configuration saine, valeurs vides comprises', async () => {
    const result = await patch({
      healthCheckEnabled: true,
      healthCheckPath: '/health',
      healthCheckMethod: 'get',
      healthCheckPort: '3000',
      healthCheckHost: 'localhost',
      healthCheckResponseText: 'ok',
      watchPaths: 'apps/web/**,packages/*/src/**',
    })
    expect(result.status).toBe(200)
    expect(state.patches[0]).toMatchObject({ healthCheckPath: '/health', healthCheckMethod: 'GET', healthCheckPort: '3000' })
    expect((await patch({ healthCheckPath: '', healthCheckMethod: '', healthCheckPort: '', healthCheckHost: '' })).status).toBe(200)
  })
})
