import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadModule() {
  vi.resetModules()
  vi.stubEnv('COOLIFY_API_URL', 'https://coolify.test/api/v1')
  vi.stubEnv('COOLIFY_API_TOKEN', 'test-token')
  return import('./coolify')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
