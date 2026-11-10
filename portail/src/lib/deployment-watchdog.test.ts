import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DEPLOYMENT_TIMEOUT_MINUTES,
  deploymentTimeoutMessage,
  deploymentTimeoutMs,
  expireStaleDeployments,
  isDeploymentExpired,
} from './deployment-watchdog'

const MINUTE = 60_000

describe('délai maximal d’un déploiement', () => {
  it('utilise 30 minutes par défaut', () => {
    expect(deploymentTimeoutMs({} as NodeJS.ProcessEnv)).toBe(
      DEFAULT_DEPLOYMENT_TIMEOUT_MINUTES * MINUTE,
    )
  })

  it('accepte une surcharge par variable d’environnement', () => {
    expect(deploymentTimeoutMs({ DEPLOYMENT_TIMEOUT_MINUTES: '45' } as NodeJS.ProcessEnv)).toBe(
      45 * MINUTE,
    )
  })

  it('ignore une valeur invalide ou nulle', () => {
    for (const raw of ['', '0', '-5', 'abc']) {
      expect(
        deploymentTimeoutMs({ DEPLOYMENT_TIMEOUT_MINUTES: raw } as NodeJS.ProcessEnv),
      ).toBe(DEFAULT_DEPLOYMENT_TIMEOUT_MINUTES * MINUTE)
    }
  })

  it('le message contient « délai dépassé » et la durée', () => {
    const message = deploymentTimeoutMessage(30 * MINUTE)
    expect(message).toMatch(/délai dépassé/i)
    expect(message).toContain('30 minutes')
  })
})

describe('isDeploymentExpired', () => {
  const now = new Date('2026-11-10T12:00:00.000Z')

  it('expire un déploiement non terminal trop ancien', () => {
    expect(
      isDeploymentExpired({ status: 'building', createdAt: new Date('2026-11-10T11:00:00.000Z') }, now, 30 * MINUTE),
    ).toBe(true)
  })

  it('laisse tranquille un déploiement récent', () => {
    expect(
      isDeploymentExpired({ status: 'deploying', createdAt: new Date('2026-11-10T11:45:00.000Z') }, now, 30 * MINUTE),
    ).toBe(false)
  })

  it('ne touche jamais un état terminal (dont cancelled)', () => {
    for (const status of ['live', 'failed', 'cancelled']) {
      expect(
        isDeploymentExpired({ status, createdAt: new Date('2026-11-09T00:00:00.000Z') }, now, 30 * MINUTE),
      ).toBe(false)
    }
  })
})

describe('expireStaleDeployments', () => {
  it('passe en échec les déploiements bloqués et compte les transitions réussies', async () => {
    const now = new Date('2026-11-10T12:00:00.000Z')
    const fail = vi.fn(async () => true)
    const findExpired = vi.fn(async () => [
      { id: 'a', status: 'building', createdAt: new Date('2026-11-10T10:00:00.000Z') },
      { id: 'b', status: 'queued', createdAt: new Date('2026-11-10T10:30:00.000Z') },
    ])

    const result = await expireStaleDeployments({ findExpired, fail }, { now, timeoutMs: 30 * MINUTE })

    expect(result.expired).toBe(2)
    expect(findExpired).toHaveBeenCalledWith(new Date('2026-11-10T11:30:00.000Z'))
    expect(fail).toHaveBeenCalledTimes(2)
    expect(fail.mock.calls[0]?.[1]).toMatch(/délai dépassé/i)
  })

  it('ne compte pas une transition perdue face à une annulation concurrente', async () => {
    const now = new Date('2026-11-10T12:00:00.000Z')
    const fail = vi.fn(async () => false)
    const findExpired = vi.fn(async () => [
      { id: 'a', status: 'deploying', createdAt: new Date('2026-11-10T09:00:00.000Z') },
    ])

    const result = await expireStaleDeployments({ findExpired, fail }, { now, timeoutMs: 30 * MINUTE })

    expect(result.expired).toBe(0)
  })

  it('re-vérifie le délai sur les lignes retournées par la requête', async () => {
    const now = new Date('2026-11-10T12:00:00.000Z')
    const fail = vi.fn(async () => true)
    const findExpired = vi.fn(async () => [
      { id: 'recent', status: 'building', createdAt: new Date('2026-11-10T11:59:00.000Z') },
    ])

    const result = await expireStaleDeployments({ findExpired, fail }, { now, timeoutMs: 30 * MINUTE })

    expect(result.expired).toBe(0)
    expect(fail).not.toHaveBeenCalled()
  })
})
