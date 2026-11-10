import { describe, expect, it } from 'vitest'
import {
  ROLLBACK_REFUSAL_MESSAGES,
  isCommitSha,
  rollbackRefusal,
} from '@/lib/deployment-rollback'

const SHA = 'a'.repeat(40)

describe('isCommitSha', () => {
  it('accepte un identifiant complet en minuscules', () => {
    expect(isCommitSha(SHA)).toBe(true)
    expect(isCommitSha('0123456789abcdef0123456789abcdef01234567')).toBe(true)
  })

  it('refuse un SHA court, majuscule, non hexadécimal ou absent', () => {
    expect(isCommitSha('a'.repeat(39))).toBe(false)
    expect(isCommitSha('a'.repeat(41))).toBe(false)
    expect(isCommitSha('A'.repeat(40))).toBe(false)
    expect(isCommitSha('z'.repeat(40))).toBe(false)
    expect(isCommitSha('pending')).toBe(false)
    expect(isCommitSha('')).toBe(false)
    expect(isCommitSha(null)).toBe(false)
    expect(isCommitSha(undefined)).toBe(false)
  })
})

describe('rollbackRefusal', () => {
  it('autorise un déploiement réussi avec un SHA complet', () => {
    expect(rollbackRefusal({ status: 'live', commitSha: SHA })).toBeNull()
  })

  it('refuse un commit inexploitable avant même de regarder l’état', () => {
    // « pending » est la valeur d’un déploiement qui n’a pas encore de commit.
    expect(rollbackRefusal({ status: 'live', commitSha: 'pending' })).toBe('invalid_commit')
    expect(rollbackRefusal({ status: 'failed', commitSha: 'abc1234' })).toBe('invalid_commit')
  })

  it('refuse un déploiement non réussi (Coolify ne rejoue qu’un commit déjà livré)', () => {
    for (const status of ['queued', 'analyzing', 'provisioning', 'building', 'deploying', 'failed', 'cancelled']) {
      expect(rollbackRefusal({ status, commitSha: SHA })).toBe('not_live')
    }
  })

  it('fournit un message français pour chaque refus', () => {
    expect(ROLLBACK_REFUSAL_MESSAGES.invalid_commit).toMatch(/commit/i)
    expect(ROLLBACK_REFUSAL_MESSAGES.not_live).toMatch(/réussi/i)
  })
})
