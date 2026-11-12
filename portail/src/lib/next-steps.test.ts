import { describe, expect, it } from 'vitest'
import { allStepsDone, computeNextSteps } from '@/lib/next-steps'

describe('next-steps', () => {
  it('ne propose rien sans déploiement réussi ou sans droit', () => {
    expect(computeNextSteps({ hasVerifiedDomain: false, hasEnvVars: false, memberCount: 1, hasSuccessfulDeploy: false, canManage: true })).toEqual([])
    expect(computeNextSteps({ hasVerifiedDomain: false, hasEnvVars: false, memberCount: 1, hasSuccessfulDeploy: true, canManage: false })).toEqual([])
  })

  it('calcule les étapes à partir des données réelles', () => {
    const steps = computeNextSteps({ hasVerifiedDomain: true, hasEnvVars: false, memberCount: 1, hasSuccessfulDeploy: true, canManage: true }, 'proj')
    expect(steps).toHaveLength(3)
    expect(steps.find((s) => s.id === 'domain')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'env')?.done).toBe(false)
    expect(steps.find((s) => s.id === 'team')?.done).toBe(false)
  })

  it('détecte quand tout est fait', () => {
    const steps = computeNextSteps({ hasVerifiedDomain: true, hasEnvVars: true, memberCount: 2, hasSuccessfulDeploy: true, canManage: true })
    expect(allStepsDone(steps)).toBe(true)
  })
})
