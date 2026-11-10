import { describe, expect, it, vi } from 'vitest'
import {
  CANCEL_NOTE,
  cancelDeployment,
  planCancellation,
  type CancelDeps,
} from './deployment-cancel'

function deps(overrides: Partial<CancelDeps> = {}): CancelDeps & {
  removeQueuedJob: ReturnType<typeof vi.fn>
  cancelCoolify: ReturnType<typeof vi.fn>
  markCancelled: ReturnType<typeof vi.fn>
} {
  return {
    removeQueuedJob: vi.fn(async () => 'removed' as const),
    cancelCoolify: vi.fn(async () => ({ ok: true as const })),
    markCancelled: vi.fn(async () => true),
    ...overrides,
  } as never
}

describe('planCancellation', () => {
  it('retire le job d’un déploiement encore en file', () => {
    expect(planCancellation({ status: 'queued', coolifyBuildId: null })).toEqual({
      kind: 'cancel',
      removeQueuedJob: true,
      coolifyBuildId: null,
    })
  })

  it('annule côté Coolify un déploiement déjà démarré', () => {
    expect(planCancellation({ status: 'building', coolifyBuildId: 'build-1' })).toEqual({
      kind: 'cancel',
      removeQueuedJob: false,
      coolifyBuildId: 'build-1',
    })
  })

  it('refuse un déploiement terminal', () => {
    for (const status of ['live', 'failed', 'cancelled']) {
      const plan = planCancellation({ status, coolifyBuildId: null })
      expect(plan.kind).toBe('refuse')
      if (plan.kind === 'refuse') expect(plan.code).toBe('terminal')
    }
  })

  it('refuse un état inconnu', () => {
    const plan = planCancellation({ status: 'inconnu', coolifyBuildId: null })
    expect(plan).toMatchObject({ kind: 'refuse', code: 'unknown' })
  })
})

describe('cancelDeployment', () => {
  it('annule un job en file sans appeler Coolify', async () => {
    const d = deps()
    const result = await cancelDeployment(
      { id: 'dep-1', status: 'queued', coolifyBuildId: null },
      d,
    )

    expect(result).toEqual({ ok: true, status: 'cancelled' })
    expect(d.removeQueuedJob).toHaveBeenCalledWith('dep-1')
    expect(d.cancelCoolify).not.toHaveBeenCalled()
    expect(d.markCancelled).toHaveBeenCalledWith('dep-1', CANCEL_NOTE)
  })

  it('annule côté Coolify puis fixe l’état local', async () => {
    const d = deps()
    const result = await cancelDeployment(
      { id: 'dep-1', status: 'deploying', coolifyBuildId: 'build-1' },
      d,
    )

    expect(result).toEqual({ ok: true, status: 'cancelled' })
    expect(d.removeQueuedJob).not.toHaveBeenCalled()
    expect(d.cancelCoolify).toHaveBeenCalledWith('build-1')
    expect(d.markCancelled).toHaveBeenCalledWith('dep-1', CANCEL_NOTE)
  })

  it('annule localement même si Coolify refuse, avec un avertissement', async () => {
    const d = deps({ cancelCoolify: vi.fn(async () => ({ error: 'API indisponible' })) })
    const result = await cancelDeployment(
      { id: 'dep-1', status: 'building', coolifyBuildId: 'build-1' },
      d,
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warning).toContain('API indisponible')
    expect(d.markCancelled).toHaveBeenCalled()
  })

  it('signale une course quand le déploiement se termine avant l’annulation', async () => {
    const d = deps({ markCancelled: vi.fn(async () => false) })
    const result = await cancelDeployment(
      { id: 'dep-1', status: 'deploying', coolifyBuildId: 'build-1' },
      d,
    )

    expect(result).toMatchObject({ ok: false, code: 'race' })
  })

  it('ne touche à rien pour un déploiement déjà en ligne', async () => {
    const d = deps()
    const result = await cancelDeployment(
      { id: 'dep-1', status: 'live', coolifyBuildId: 'build-1' },
      d,
    )

    expect(result).toMatchObject({ ok: false, code: 'terminal' })
    expect(d.removeQueuedJob).not.toHaveBeenCalled()
    expect(d.cancelCoolify).not.toHaveBeenCalled()
    expect(d.markCancelled).not.toHaveBeenCalled()
  })
})
