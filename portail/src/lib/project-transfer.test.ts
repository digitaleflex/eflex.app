import { describe, expect, it } from 'vitest'
import { transferProjectSchema } from '@/lib/project-transfer'

// Test unitaire (sans base) : le contrat d'entrée du transfert est validé avant
// toute vérification d'autorisation ou d'existence en base.
describe('transferProjectSchema', () => {
  it('accepte un identifiant d’organisation non vide et le nettoie', () => {
    expect(transferProjectSchema.parse({ organizationId: '  org_123  ' })).toEqual({
      organizationId: 'org_123',
    })
  })

  it('refuse une organisation absente, vide ou non textuelle', () => {
    for (const body of [{}, { organizationId: '' }, { organizationId: '   ' }, { organizationId: 42 }]) {
      const parsed = transferProjectSchema.safeParse(body)
      expect(parsed.success).toBe(false)
    }
  })

  it('refuse un identifiant démesuré', () => {
    const parsed = transferProjectSchema.safeParse({ organizationId: 'x'.repeat(192) })
    expect(parsed.success).toBe(false)
  })
})
