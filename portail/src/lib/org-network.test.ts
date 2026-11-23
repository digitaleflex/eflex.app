import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  org: { coolifyDestinationUuid: null as string | null } as { coolifyDestinationUuid: string | null } | null,
  updates: [] as Array<unknown>,
  create: { uuid: 'dest-1' } as { uuid: string } | { error: string; conflict?: boolean },
  existing: [] as Array<{ uuid: string; name: string | null; network: string | null }>,
  creates: 0,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: async () => state.org,
      update: async (arg: unknown) => {
        state.updates.push(arg)
      },
    },
  },
}))
vi.mock('@/lib/coolify', () => ({
  createServerDestination: async () => {
    state.creates += 1
    return state.create
  },
  listServerDestinations: async () => state.existing,
}))

import { destinationFields } from './org-network-context'
import { ensureOrganizationDestination, inOrganizationNetwork, orgNetworkName, orgNetworksEnabled } from './org-network'

beforeEach(() => {
  state.org = { coolifyDestinationUuid: null }
  state.updates = []
  state.create = { uuid: 'dest-1' }
  state.existing = []
  state.creates = 0
  delete process.env.EFLEX_ORG_NETWORKS
})

describe('réseau par organisation (S5)', () => {
  it('nomme le réseau depuis l’identifiant interne, avec un nom Docker valide', () => {
    expect(orgNetworkName('cmwqb0m5i00071q8')).toBe('eflex-net-cmwqb0m5i00071q8')
    expect(orgNetworkName('A_b-C!')).toMatch(/^eflex-net-[a-z0-9]+$/)
    expect(orgNetworkName('!!!')).toBe('eflex-net-org')
  })

  it('est désactivé par défaut', () => {
    expect(orgNetworksEnabled({})).toBe(false)
    expect(orgNetworksEnabled({ EFLEX_ORG_NETWORKS: '1' })).toBe(true)
  })

  it('drapeau éteint : aucun appel à l’hébergement, aucun champ ajouté', async () => {
    const fields = await inOrganizationNetwork('org1', async () => destinationFields())
    expect(fields).toEqual({})
    expect(state.creates).toBe(0)
  })

  it('drapeau actif : crée la destination une fois, la mémorise et la fournit au provisionnement', async () => {
    process.env.EFLEX_ORG_NETWORKS = '1'
    const fields = await inOrganizationNetwork('org1', async () => destinationFields())
    expect(fields).toEqual({ destination_uuid: 'dest-1' })
    expect(state.updates).toEqual([{ where: { id: 'org1' }, data: { coolifyDestinationUuid: 'dest-1' } }])
    expect(destinationFields()).toEqual({}) // le contexte ne fuit pas hors de l'exécution
  })

  it('réutilise l’uuid déjà mémorisé sans appeler l’hébergement', async () => {
    state.org = { coolifyDestinationUuid: 'deja' }
    expect(await ensureOrganizationDestination('org1')).toBe('deja')
    expect(state.creates).toBe(0)
  })

  it('en cas de conflit, reprend le réseau existant du même nom', async () => {
    state.create = { error: 'Hébergement API 409', conflict: true }
    state.existing = [{ uuid: 'existant', name: 'x', network: orgNetworkName('org1') }]
    expect(await ensureOrganizationDestination('org1')).toBe('existant')
  })

  it('échoue fermé : jamais de repli sur le réseau partagé', async () => {
    process.env.EFLEX_ORG_NETWORKS = '1'
    state.create = { error: 'Hébergement API 500' }
    const fn = vi.fn(async () => 'x')
    await expect(inOrganizationNetwork('org1', fn)).rejects.toThrow(/Réseau de l’organisation indisponible/)
    expect(fn).not.toHaveBeenCalled()
  })
})
