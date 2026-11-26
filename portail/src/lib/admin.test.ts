import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND') }), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }) }))

import { getSession } from '@/lib/session'
import { canAdmin, isAdmin, requireAdminApi, requireAdminPage } from './admin'

const mockedGetSession = vi.mocked(getSession)

function session(role: string | null, opts: { banned?: boolean; twoFactorEnabled?: boolean } = {}) {
  return {
    session: { id: 's1' },
    user: { id: 'u1', email: 'a@b.test', role, banned: opts.banned ?? false, twoFactorEnabled: opts.twoFactorEnabled ?? false },
  } as any
}

afterEach(() => {
  vi.unstubAllEnvs()
  mockedGetSession.mockReset()
})

describe('admin guards', () => {
  it('reconnaît les rôles admin et leurs permissions', () => {
    expect(isAdmin(session('super_admin'))).toBe(true)
    expect(isAdmin(session('admin'))).toBe(true)
    expect(isAdmin(session('support'))).toBe(true)
    expect(isAdmin(session('user'))).toBe(false)
    expect(canAdmin(session('finance'), 'admin.payments.manage')).toBe(true)
    expect(canAdmin(session('finance'), 'admin.projects.manage')).toBe(false)
  })

  it('bloque l’accès admin API sans 2FA quand enforcement actif', async () => {
    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', '')
    mockedGetSession.mockResolvedValue(session('super_admin', { twoFactorEnabled: false }))
    const result = await requireAdminApi('admin.overview.read')
    expect('response' in result).toBe(true)
    if ('response' in result) expect(result.response.status).toBe(403)
  })

  it('autorise l’accès admin API avec 2FA ou grâce future', async () => {
    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', '2099-01-01T00:00:00.000Z')
    mockedGetSession.mockResolvedValue(session('support', { twoFactorEnabled: false }))
    const grace = await requireAdminApi('admin.support.read')
    expect('session' in grace).toBe(true)

    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', '')
    mockedGetSession.mockResolvedValue(session('support', { twoFactorEnabled: true }))
    const ok = await requireAdminApi('admin.support.read')
    expect('session' in ok).toBe(true)
  })

  it('renvoie 404 si la permission manque', async () => {
    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', 'never')
    mockedGetSession.mockResolvedValue(session('finance', { twoFactorEnabled: false }))
    const result = await requireAdminApi('admin.projects.manage')
    expect('response' in result).toBe(true)
    if ('response' in result) expect(result.response.status).toBe(404)
  })

  it('redirige la page admin sans 2FA vers les paramètres', async () => {
    vi.stubEnv('ADMIN_2FA_ENFORCE_AFTER', '')
    mockedGetSession.mockResolvedValue(session('super_admin', { twoFactorEnabled: false }))
    await expect(requireAdminPage('admin.overview.read')).rejects.toThrow('REDIRECT:/dashboard/settings?admin2fa=required#securite')
  })
})
