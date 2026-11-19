import { afterEach, describe, expect, it, vi } from 'vitest'

const coolifyFetchMock = vi.fn()

vi.mock('@/lib/coolify', () => ({
  coolifyFetch: (...args: unknown[]) => coolifyFetchMock(...args),
}))

describe('coolify-capabilities', () => {
  afterEach(() => {
    vi.resetModules()
    coolifyFetchMock.mockReset()
  })

  it('lit la version et sonde l’API bases managées', async () => {
    coolifyFetchMock.mockImplementation((path: string) => {
      if (path === '/version') return Promise.resolve({ data: { version: '4.7.5' } })
      if (path === '/databases') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: {} })
    })
    const mod = await import('@/lib/coolify-capabilities')
    mod.resetCoolifyCapabilitiesCache()
    const caps = await mod.getCoolifyRuntimeCapabilities({ force: true })
    expect(caps).toMatchObject({ version: '4.7.5', reachable: true, databaseApiAvailable: true })
  })

  it('marque l’API bases managées indisponible sur 404', async () => {
    coolifyFetchMock.mockImplementation((path: string) => {
      if (path === '/version') return Promise.resolve({ data: '4.6.0' })
      if (path === '/databases') return Promise.resolve({ error: 'Hébergement API 404: Not Found' })
      return Promise.resolve({ data: {} })
    })
    const mod = await import('@/lib/coolify-capabilities')
    mod.resetCoolifyCapabilitiesCache()
    const caps = await mod.getCoolifyRuntimeCapabilities({ force: true })
    expect(caps.reachable).toBe(true)
    expect(caps.databaseApiAvailable).toBe(false)
  })

  it('reste exploitable quand Coolify est injoignable', async () => {
    coolifyFetchMock.mockImplementation((path: string) => {
      if (path === '/version') return Promise.resolve({ error: 'Service de déploiement injoignable : timeout' })
      if (path === '/databases') return Promise.resolve({ error: 'Service de déploiement injoignable : timeout' })
      return Promise.resolve({ data: {} })
    })
    const mod = await import('@/lib/coolify-capabilities')
    mod.resetCoolifyCapabilitiesCache()
    const caps = await mod.getCoolifyRuntimeCapabilities({ force: true })
    expect(caps.reachable).toBe(false)
    expect(caps.version).toBeNull()
  })
})
