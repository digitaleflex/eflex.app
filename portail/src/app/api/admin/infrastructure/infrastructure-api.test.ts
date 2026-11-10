import { describe, expect, it, vi } from 'vitest'

// Contrat d'accès : les routes d'infrastructure sont réservées aux
// administrateurs et répondent 404 (jamais 403) aux autres visiteurs.
// Le test ne touche ni la base ni le réseau : la garde répond avant la collecte.
const state = vi.hoisted(() => ({ session: null as unknown }))

vi.mock('@/lib/session', () => ({ getSession: async () => state.session }))

const ROUTES = [
  { name: 'settings', load: async () => (await import('@/app/api/admin/infrastructure/settings/route')).POST },
  { name: 'check', load: async () => (await import('@/app/api/admin/infrastructure/check/route')).POST },
]

const regularSession = {
  user: { id: 'user-1', email: 'simple@exemple.fr', role: 'user', banned: false },
  session: {},
}

describe('API infrastructure : accès réservé', () => {
  it.each(ROUTES)('$name : 404 pour un visiteur anonyme', async (route) => {
    state.session = null
    const POST = await route.load()
    const response = await POST(
      new Request(`http://localhost/api/admin/infrastructure/${route.name}`, {
        method: 'POST',
        body: JSON.stringify({ maintenanceEnabled: true }),
      }),
    )
    expect(response.status).toBe(404)
  })

  it.each(ROUTES)('$name : 404 pour un utilisateur non administrateur', async (route) => {
    state.session = regularSession
    const POST = await route.load()
    const response = await POST(
      new Request(`http://localhost/api/admin/infrastructure/${route.name}`, {
        method: 'POST',
        body: JSON.stringify({ maintenanceEnabled: true }),
      }),
    )
    expect(response.status).toBe(404)
  })

  it.each(ROUTES)('$name : 404 pour un administrateur suspendu', async (route) => {
    state.session = { user: { ...regularSession.user, role: 'admin', banned: true }, session: {} }
    const POST = await route.load()
    const response = await POST(
      new Request(`http://localhost/api/admin/infrastructure/${route.name}`, { method: 'POST', body: '{}' }),
    )
    expect(response.status).toBe(404)
  })
})
