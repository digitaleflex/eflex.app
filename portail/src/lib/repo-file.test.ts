import { describe, expect, it, vi } from 'vitest'
import { fetchRepositoryFile } from './repo-file'

function fetcher(response: Response): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(typeof input === 'string' ? input : input.toString())
    return response
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('fetchRepositoryFile', () => {
  it('lit le fichier public depuis raw.githubusercontent.com', async () => {
    const { impl, calls } = fetcher(new Response('services:\n  app:\n    build: .\n', { status: 200 }))

    const result = await fetchRepositoryFile({
      repoUrl: 'https://github.com/acme/app',
      branch: 'main',
      repoPrivate: false,
      userId: 'user',
      installationId: null,
      path: 'apps/api/docker-compose.yml',
      fetchImpl: impl,
    })

    expect(result).toEqual({ content: 'services:\n  app:\n    build: .\n' })
    expect(calls[0]).toBe(
      'https://raw.githubusercontent.com/acme/app/main/apps/api/docker-compose.yml',
    )
  })

  it('refuse un chemin qui sort du dépôt sans appeler le réseau', async () => {
    const { impl, calls } = fetcher(new Response('', { status: 200 }))

    const result = await fetchRepositoryFile({
      repoUrl: 'https://github.com/acme/app',
      branch: 'main',
      repoPrivate: false,
      userId: 'user',
      installationId: null,
      path: '../secret',
      fetchImpl: impl,
    })

    expect(result).toEqual({ error: 'Le chemin du fichier à lire est invalide.' })
    expect(calls).toHaveLength(0)
  })

  it('rend un message explicite quand le fichier compose est absent', async () => {
    const { impl } = fetcher(new Response('Not Found', { status: 404 }))

    const result = await fetchRepositoryFile({
      repoUrl: 'https://github.com/acme/app',
      branch: 'main',
      repoPrivate: false,
      userId: 'user',
      installationId: null,
      path: 'docker-compose.yml',
      fetchImpl: impl,
    })

    expect(result).toEqual({
      error: 'Fichier compose introuvable dans le dépôt (branche « main », chemin « docker-compose.yml »).',
    })
  })
})
