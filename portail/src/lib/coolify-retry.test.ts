import { describe, expect, it, vi } from 'vitest'
import { fetchWithRetry, isIdempotentMethod, retryDelayMs } from './coolify-retry'

const ok = () => new Response('{}', { status: 200 })
const status = (code: number, headers?: Record<string, string>) => new Response('', { status: code, headers })
const noSleep = async () => undefined

describe('fetchWithRetry', () => {
  it('rejoue un GET après un 503 puis réussit', async () => {
    const doFetch = vi.fn().mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok())
    const res = await fetchWithRetry(doFetch, 'GET', { sleep: noSleep })
    expect(res.status).toBe(200)
    expect(doFetch).toHaveBeenCalledTimes(2)
  })

  it('rejoue un GET après une erreur réseau', async () => {
    const doFetch = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(ok())
    const res = await fetchWithRetry(doFetch, undefined, { sleep: noSleep })
    expect(res.status).toBe(200)
    expect(doFetch).toHaveBeenCalledTimes(2)
  })

  it('ne rejoue jamais une écriture (POST/PATCH/DELETE)', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      const doFetch = vi.fn().mockResolvedValue(status(503))
      const res = await fetchWithRetry(doFetch, method, { sleep: noSleep })
      expect(res.status).toBe(503)
      expect(doFetch).toHaveBeenCalledTimes(1)
    }
    const failing = vi.fn().mockRejectedValue(new Error('réseau'))
    await expect(fetchWithRetry(failing, 'POST', { sleep: noSleep })).rejects.toThrow('réseau')
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('ne rejoue pas une erreur définitive (404, 422, 401)', async () => {
    for (const code of [401, 404, 422, 500]) {
      const doFetch = vi.fn().mockResolvedValue(status(code))
      const res = await fetchWithRetry(doFetch, 'GET', { sleep: noSleep })
      expect(res.status).toBe(code)
      expect(doFetch).toHaveBeenCalledTimes(1)
    }
  })

  it("s'arrête après le nombre d'essais et rend la dernière réponse", async () => {
    const doFetch = vi.fn().mockResolvedValue(status(502))
    const res = await fetchWithRetry(doFetch, 'GET', { attempts: 3, sleep: noSleep })
    expect(res.status).toBe(502)
    expect(doFetch).toHaveBeenCalledTimes(3)
  })

  it("relance l'erreur réseau quand tous les essais échouent", async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error('hors ligne'))
    await expect(fetchWithRetry(doFetch, 'GET', { attempts: 2, sleep: noSleep })).rejects.toThrow('hors ligne')
    expect(doFetch).toHaveBeenCalledTimes(2)
  })

  it('respecte Retry-After dans la limite du plafond', async () => {
    const waits: number[] = []
    const doFetch = vi.fn().mockResolvedValueOnce(status(429, { 'retry-after': '2' })).mockResolvedValueOnce(ok())
    await fetchWithRetry(doFetch, 'GET', { sleep: async (ms) => { waits.push(ms) } })
    expect(waits).toEqual([2000])
  })
})

describe('retryDelayMs / isIdempotentMethod', () => {
  it('double l\'attente avec une gigue bornée et un plafond', () => {
    expect(retryDelayMs(1, { baseDelayMs: 100, random: () => 1 })).toBe(100)
    expect(retryDelayMs(2, { baseDelayMs: 100, random: () => 1 })).toBe(200)
    expect(retryDelayMs(2, { baseDelayMs: 100, random: () => 0 })).toBe(100)
    expect(retryDelayMs(10, { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 })).toBe(1000)
    expect(retryDelayMs(1, {}, '60')).toBe(5000)
  })
  it('ne considère que GET/HEAD comme idempotents', () => {
    expect(isIdempotentMethod(undefined)).toBe(true)
    expect(isIdempotentMethod('get')).toBe(true)
    expect(isIdempotentMethod('POST')).toBe(false)
  })
})
