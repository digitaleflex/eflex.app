import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchVercelProjectEnv } from '@/lib/migrations/vercel'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fetchVercelProjectEnv (MIG-2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('classe les valeurs lisibles et masque l’absence de valeur non relisible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          envs: [
            { key: 'PLAIN', value: 'hello', type: 'plain', target: ['production'] },
            { key: 'SENSITIVE', value: 'do-not-expose', type: 'sensitive', target: ['production'] },
            { key: 'SECRET', type: 'secret', target: ['preview'] },
            { key: 'MISSING', type: 'encrypted', target: ['development'] },
          ],
        }),
      ),
    )

    const review = await fetchVercelProjectEnv('token-test', 'prj_123')

    const byKey = Object.fromEntries(review.variables.map((v) => [v.key, v]))
    expect(byKey.PLAIN?.readable).toBe(true)
    expect(byKey.PLAIN?.value).toBe('hello')
    expect(byKey.PLAIN?.requiresReentry).toBe(false)

    // Valeur sensible : jamais renvoyée comme lisible, même si l'API fournit un champ value.
    expect(byKey.SENSITIVE?.readable).toBe(false)
    expect(byKey.SENSITIVE?.requiresReentry).toBe(true)
    expect(byKey.SENSITIVE?.value).toBeUndefined()

    expect(byKey.SECRET?.readable).toBe(false)
    expect(byKey.SECRET?.requiresReentry).toBe(true)
    expect(byKey.SECRET?.value).toBeUndefined()

    expect(byKey.MISSING?.readable).toBe(false)
    expect(byKey.MISSING?.requiresReentry).toBe(true)

    expect(review.stats.total).toBe(4)
    expect(review.stats.readable).toBe(1)
    expect(review.stats.requiresReentry).toBe(3)
  })

  it('détecte les chevauchements de cibles pour une même clé', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          envs: [
            { key: 'API_URL', value: 'a', type: 'plain', target: ['production', 'preview'] },
            { key: 'API_URL', value: 'b', type: 'plain', target: ['production'] },
          ],
        }),
      ),
    )

    const review = await fetchVercelProjectEnv('token-test', 'prj_123')
    expect(review.overlaps).toEqual([{ key: 'API_URL', target: 'production', count: 2 }])
    expect(review.stats.overlaps).toBe(1)
    expect(review.warnings.some((w) => w.includes('plusieurs fois'))).toBe(true)
  })

  it('filtre par environnements demandés', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        envs: [
          { key: 'PROD_ONLY', value: 'p', type: 'plain', target: ['production'] },
          { key: 'DEV_ONLY', value: 'd', type: 'plain', target: ['development'] },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const review = await fetchVercelProjectEnv('token-test', 'prj_123', ['production'])
    expect(review.variables.map((v) => v.key)).toEqual(['PROD_ONLY'])
    expect(review.variables[0]?.targets).toEqual(['production'])
  })

  it('n’expose pas le jeton dans les messages d’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    await expect(fetchVercelProjectEnv('super-secret-token', 'prj_123')).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })
})
