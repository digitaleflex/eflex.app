import { describe, expect, it } from 'vitest'
import { toDeploymentItemData, type DeploymentWithLogs } from '@/lib/deployment-item-data'

const SECRET = 'sk_live_SUPERSECRET_123'

const failed: DeploymentWithLogs = {
  id: 'dep-1',
  status: 'failed',
  commitSha: 'abcdef1234567',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  logsSummary: `DATABASE_URL=${SECRET}\nnpm error code 1\nCommand failed with exit code 1`,
  app: { id: 'app-1', name: 'web' },
}

describe('toDeploymentItemData', () => {
  it('ne transmet jamais le journal brut au composant client', () => {
    const item = toDeploymentItemData(failed, 'proj-1')
    expect(item).not.toHaveProperty('logsSummary')
    expect(JSON.stringify(item)).not.toContain(SECRET)
  })

  it('ne recopie pas les champs supplémentaires de la ligne Prisma', () => {
    const withExtra = { ...failed, envVars: [{ key: 'TOKEN', value: SECRET }] } as DeploymentWithLogs
    const item = toDeploymentItemData(withExtra, 'proj-1')
    expect(Object.keys(item).sort()).toEqual(['app', 'commitSha', 'createdAt', 'diagnosis', 'id', 'status'])
    expect(JSON.stringify(item)).not.toContain(SECRET)
  })

  it('calcule le diagnostic côté serveur pour un échec', () => {
    const item = toDeploymentItemData(failed, 'proj-1')
    expect(item.diagnosis).not.toBeNull()
    expect(item.diagnosis?.action.href).toContain('proj-1')
  })

  it("n'établit aucun diagnostic hors échec", () => {
    expect(toDeploymentItemData({ ...failed, status: 'live' }, 'proj-1').diagnosis).toBeNull()
    expect(toDeploymentItemData({ ...failed, status: 'failed', logsSummary: null }, 'proj-1').diagnosis).toBeNull()
  })
})
