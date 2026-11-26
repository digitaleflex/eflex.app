import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ROLE_LABELS, adminPermissions, hasAdminPermission, isAdminRole, normalizeAdminRole } from './admin-rbac'
import { adminTwoFactorDeadline, adminTwoFactorRequired } from './admin'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('admin-rbac', () => {
  it('normalise l’ancien rôle admin vers super_admin', () => {
    expect(normalizeAdminRole('admin')).toBe('super_admin')
    expect(normalizeAdminRole('super_admin')).toBe('super_admin')
    expect(normalizeAdminRole('user')).toBeNull()
  })

  it('applique la matrice de permissions par rôle', () => {
    expect(hasAdminPermission('super_admin', 'admin.roles.manage')).toBe(true)
    expect(hasAdminPermission('exploitation', 'admin.deployments.manage')).toBe(true)
    expect(hasAdminPermission('exploitation', 'admin.payments.read')).toBe(false)
    expect(hasAdminPermission('support', 'admin.impersonation.manage')).toBe(true)
    expect(hasAdminPermission('support', 'admin.payments.manage')).toBe(false)
    expect(hasAdminPermission('finance', 'admin.payments.manage')).toBe(true)
    expect(hasAdminPermission('finance', 'admin.deployments.manage')).toBe(false)
    expect(isAdminRole('finance')).toBe(true)
  })

  it('expose les libellés et permissions', () => {
    expect(ADMIN_ROLE_LABELS.support).toBe('Support')
    expect(adminPermissions('support')).toContain('admin.support.manage')
    expect(adminPermissions('user')).toEqual([])
  })
})

describe('admin 2FA enforcement', () => {
  it('est actif par défaut et peut être désactivé ou différé', () => {
    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', '')
    expect(adminTwoFactorRequired(new Date('2026-01-01T00:00:00Z').getTime())).toBe(true)
    expect(adminTwoFactorDeadline()).toBeNull()

    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', 'never')
    expect(adminTwoFactorRequired()).toBe(false)
    expect(adminTwoFactorDeadline()).toBe('never')

    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', '2026-12-01T00:00:00.000Z')
    expect(adminTwoFactorRequired(Date.parse('2026-11-30T00:00:00.000Z'))).toBe(false)
    expect(adminTwoFactorRequired(Date.parse('2026-12-01T00:00:00.000Z'))).toBe(true)
    expect(adminTwoFactorDeadline()).toBeInstanceOf(Date)
  })
})
