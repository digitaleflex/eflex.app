import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureServerError, errorTrackingEnabled, scrubErrorData } from './error-tracking'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('error-tracking', () => {
  it('est inerte sans DSN', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('ERROR_TRACKING_DSN', '')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    await expect(captureServerError(new Error('boom'), { route: '/api/test' })).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errorTrackingEnabled()).toBe(false)
  })

  it('nettoie les champs sensibles avant envoi', () => {
    const scrubbed = scrubErrorData({
      password: 'secret',
      token: 'abc',
      nested: { authorization: 'Bearer x', safe: 'ok' },
      message: 'hello',
    }) as Record<string, unknown>

    expect(scrubbed.password).toBe('[masqué]')
    expect(scrubbed.token).toBe('[masqué]')
    expect((scrubbed.nested as Record<string, unknown>).authorization).toBe('[masqué]')
    expect((scrubbed.nested as Record<string, unknown>).safe).toBe('ok')
    expect(scrubbed.message).toBe('hello')
  })

  it('nettoie les piles et les messages d’erreur', () => {
    const err = new Error('token=abc')
    err.stack = 'Error: token=abc\n    at secret https://x.test?password=foo'
    const scrubbed = scrubErrorData(err) as { name: string; message: string; stack: string }
    expect(scrubbed.name).toBe('Error')
    expect(String(scrubbed.message)).toContain('[masqué]')
    expect(scrubbed.stack).toContain('token=[masqué]')
    expect(scrubbed.stack).toContain('password=[masqué]')
  })
})
