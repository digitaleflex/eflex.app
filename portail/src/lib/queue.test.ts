import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEPLOYMENT_QUEUE,
  acquireDeploymentLocks,
  getDeploymentQueueDiagnostics,
  recoverDeploymentQueueJob,
  redisConnection,
} from './queue'

let savedUrl: string | undefined

beforeEach(() => {
  savedUrl = process.env.REDIS_URL
})

afterEach(() => {
  if (savedUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = savedUrl
})

describe('redisConnection', () => {
  it('lit une URL simple', () => {
    process.env.REDIS_URL = 'redis://eflex-redis:6379'
    expect(redisConnection()).toMatchObject({ host: 'eflex-redis', port: 6379 })
  })

  it('gère le port, le mot de passe et la base', () => {
    process.env.REDIS_URL = 'redis://:motdepasse@127.0.0.1:6380/3'
    expect(redisConnection()).toMatchObject({
      host: '127.0.0.1',
      port: 6380,
      password: 'motdepasse',
      db: 3,
    })
  })

  it('échoue explicitement sans REDIS_URL', () => {
    delete process.env.REDIS_URL
    expect(() => redisConnection()).toThrow(/REDIS_URL/)
  })

  it('expose un nom de file stable', () => {
    expect(DEPLOYMENT_QUEUE).toBe('eflex-deployments')
  })
})

describe('diagnostics et verrous sans Redis', () => {
  it('retourne null pour le diagnostic si REDIS_URL est absente', async () => {
    delete process.env.REDIS_URL
    await expect(getDeploymentQueueDiagnostics('dep-1')).resolves.toBeNull()
  })

  it('n’utilise pas de verrou distribué sans Redis configuré (garde-fous DB conservés)', async () => {
    delete process.env.REDIS_URL
    const lock = await acquireDeploymentLocks(['eflex:deploy-lock:projet'])
    expect(lock.acquired).toBe(true)
    await expect(lock.release()).resolves.toBeUndefined()
  })

  it('refuse la relance de file sans Redis', async () => {
    delete process.env.REDIS_URL
    await expect(recoverDeploymentQueueJob('dep-1')).resolves.toEqual({
      ok: false,
      error: 'Redis non configuré.',
    })
  })
})
