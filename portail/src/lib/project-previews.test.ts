import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  maintenance: false,
  projects: [] as unknown[],
  findManyCalls: 0,
  coolifyCalls: 0,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findMany: async () => {
        state.findManyCalls += 1
        return state.projects
      },
    },
  },
}))
vi.mock('@/lib/coolify', () => {
  const track = async () => {
    state.coolifyCalls += 1
    return { error: 'ne devrait pas être appelé' }
  }
  return {
    createOrRedeployApplicationPreview: track,
    deleteApplicationPreview: track,
    enableApplicationPreviews: track,
    getApplicationPreview: track,
  }
})
vi.mock('@/lib/project-apps', () => ({ getPrimaryApp: () => null }))
vi.mock('@/lib/platform-settings', () => ({ isMaintenanceActive: async () => state.maintenance }))

import { handlePullRequestEvent, parsePullRequestEvent } from './project-previews'

const payload = (over: Record<string, unknown> = {}, headRepo: Record<string, unknown> = {}) => ({
  action: 'opened',
  repository: { full_name: 'Acme/Boutique' },
  pull_request: {
    number: 42,
    title: 'Ajout panier',
    html_url: 'https://github.com/Acme/Boutique/pull/42',
    draft: false,
    merged: false,
    user: { login: 'dev' },
    base: { ref: 'main' },
    head: { ref: 'feat/panier', sha: 'abc123', repo: { full_name: 'Acme/Boutique', fork: false, ...headRepo } },
  },
  ...over,
})

beforeEach(() => {
  state.maintenance = false
  state.projects = []
  state.findManyCalls = 0
  state.coolifyCalls = 0
})

describe('parsePullRequestEvent', () => {
  it('normalise un événement complet', () => {
    expect(parsePullRequestEvent(payload())).toMatchObject({
      action: 'opened',
      number: 42,
      headRef: 'feat/panier',
      headSha: 'abc123',
      headRepoFork: false,
      repositoryFullName: 'Acme/Boutique',
      draft: false,
      merged: false,
    })
  })

  it('refuse les charges incomplètes ou non objets', () => {
    for (const bad of [null, 'x', 42, {}, { action: 'opened' }, payload({ pull_request: { title: 'sans numéro' } })]) {
      expect(parsePullRequestEvent(bad)).toBeNull()
    }
  })

  it('signale une PR issue d’un fork', () => {
    expect(parsePullRequestEvent(payload({}, { fork: true }))?.headRepoFork).toBe(true)
  })
})

describe('handlePullRequestEvent : garde-fous', () => {
  it('ignore une PR de fork sans lire la base ni appeler l’hébergement (secrets de l’application protégés)', async () => {
    const event = parsePullRequestEvent(payload({}, { fork: true, full_name: 'pirate/Boutique' }))!
    const results = await handlePullRequestEvent(event)
    expect(results).toEqual([expect.objectContaining({ status: 'skipped', reason: expect.stringContaining('fork') })])
    expect(state.findManyCalls).toBe(0)
    expect(state.coolifyCalls).toBe(0)
  })

  it('ignore une PR dont le dépôt source n’est pas le dépôt cible, même sans drapeau fork', async () => {
    const event = parsePullRequestEvent(payload({}, { full_name: 'autre/Boutique' }))!
    expect((await handlePullRequestEvent(event))[0]).toMatchObject({ status: 'skipped' })
    expect(state.coolifyCalls).toBe(0)
  })

  it('ignore une PR sans dépôt source identifiable', async () => {
    const event = parsePullRequestEvent(payload())!
    expect((await handlePullRequestEvent({ ...event, headRepoFullName: null }))[0]).toMatchObject({ status: 'skipped' })
  })

  it('ignore tout pendant la maintenance de la plateforme', async () => {
    state.maintenance = true
    const results = await handlePullRequestEvent(parsePullRequestEvent(payload())!)
    expect(results[0]).toMatchObject({ status: 'skipped', reason: 'maintenance de la plateforme' })
    expect(state.findManyCalls).toBe(0)
  })

  it('sans projet ayant activé les prévisualisations, ne fait rien', async () => {
    const results = await handlePullRequestEvent(parsePullRequestEvent(payload())!)
    expect(results).toEqual([expect.objectContaining({ projectId: '', status: 'skipped' })])
    expect(state.coolifyCalls).toBe(0)
  })

  it('ignore un projet dont l’organisation est suspendue', async () => {
    state.projects = [{ id: 'p1', organization: { suspendedAt: new Date() }, apps: [] }]
    const results = await handlePullRequestEvent(parsePullRequestEvent(payload())!)
    expect(results[0]).toMatchObject({ projectId: 'p1', status: 'skipped' })
    expect(state.coolifyCalls).toBe(0)
  })
})
