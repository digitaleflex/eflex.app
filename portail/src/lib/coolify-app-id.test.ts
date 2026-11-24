import { describe, expect, it, vi } from 'vitest'
import { persistCreatedAppId } from './coolify-app-id'

const noSleep = async (): Promise<void> => undefined

describe('persistCreatedAppId', () => {
  it("n'appelle pas la compensation quand l'écriture réussit", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const rollback = vi.fn()
    const result = await persistCreatedAppId({ appId: 'app-1', write, rollback, sleep: noSleep })
    expect(result).toEqual({ ok: true })
    expect(write).toHaveBeenCalledTimes(1)
    expect(rollback).not.toHaveBeenCalled()
  })

  it('réessaie une écriture transitoire sans supprimer l\'application', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('connexion perdue')).mockResolvedValue(undefined)
    const rollback = vi.fn()
    const result = await persistCreatedAppId({ appId: 'app-1', write, rollback, sleep: noSleep })
    expect(result).toEqual({ ok: true })
    expect(write).toHaveBeenCalledTimes(2)
    expect(rollback).not.toHaveBeenCalled()
  })

  it("supprime l'application créée quand toutes les écritures échouent", async () => {
    const write = vi.fn().mockRejectedValue(new Error('base indisponible'))
    const rollback = vi.fn().mockResolvedValue({ ok: true })
    const result = await persistCreatedAppId({ appId: 'app-9', write, rollback, attempts: 3, sleep: noSleep })
    expect(write).toHaveBeenCalledTimes(3)
    expect(rollback).toHaveBeenCalledWith('app-9')
    expect(result).toEqual({ ok: false, error: 'base indisponible', rolledBack: true })
  })

  it("signale quand la compensation échoue aussi (application possiblement orpheline)", async () => {
    const write = vi.fn().mockRejectedValue(new Error('base indisponible'))
    const rollback = vi.fn().mockResolvedValue({ error: 'Hébergement API 500' })
    const result = await persistCreatedAppId({ appId: 'app-9', write, rollback, attempts: 2, sleep: noSleep })
    expect(result).toEqual({ ok: false, error: 'base indisponible', rolledBack: false })
  })

  it('allonge l\'attente à chaque essai', async () => {
    const waits: number[] = []
    const write = vi.fn().mockRejectedValue(new Error('x'))
    const rollback = vi.fn().mockResolvedValue({ ok: true })
    await persistCreatedAppId({
      appId: 'a', write, rollback, attempts: 3, delayMs: 100,
      sleep: async (ms) => { waits.push(ms) },
    })
    expect(waits).toEqual([100, 200])
  })
})
