import { describe, expect, it, vi } from 'vitest'
import { reconcileDeploymentQueue } from './queue-reconcile'

describe('reconcileDeploymentQueue', () => {
  it('ré-enfile uniquement les déploiements dont le job a disparu', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined)
    const result = await reconcileDeploymentQueue({
      findPending: async () => [
        { id: 'a', rollback: false },
        { id: 'b', rollback: false },
      ],
      hasJob: async (id) => id === 'a',
      enqueue,
    })
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith('b', { rollback: false })
    expect(result).toEqual({ checked: 2, reenqueued: ['b'], errors: 0 })
  })

  it('conserve la cible d\'un retour arrière', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined)
    await reconcileDeploymentQueue({
      findPending: async () => [{ id: 'r', rollback: true }],
      hasJob: async () => false,
      enqueue,
    })
    expect(enqueue).toHaveBeenCalledWith('r', { rollback: true })
  })

  it("ne fait rien quand tous les jobs existent (aucun double traitement)", async () => {
    const enqueue = vi.fn()
    const result = await reconcileDeploymentQueue({
      findPending: async () => [{ id: 'a', rollback: false }, { id: 'b', rollback: true }],
      hasJob: async () => true,
      enqueue,
    })
    expect(enqueue).not.toHaveBeenCalled()
    expect(result.reenqueued).toEqual([])
  })

  it("poursuit après une erreur et la compte", async () => {
    const enqueue = vi.fn().mockRejectedValueOnce(new Error('redis down')).mockResolvedValue(undefined)
    const logs: string[] = []
    const result = await reconcileDeploymentQueue({
      findPending: async () => [{ id: 'a', rollback: false }, { id: 'b', rollback: false }],
      hasJob: async () => false,
      enqueue,
      log: (m) => logs.push(m),
    })
    expect(result).toEqual({ checked: 2, reenqueued: ['b'], errors: 1 })
    expect(logs.some((m) => m.includes('redis down'))).toBe(true)
  })

  it("liste vide : rien à faire", async () => {
    const result = await reconcileDeploymentQueue({
      findPending: async () => [],
      hasJob: async () => true,
      enqueue: vi.fn(),
    })
    expect(result).toEqual({ checked: 0, reenqueued: [], errors: 0 })
  })
})
