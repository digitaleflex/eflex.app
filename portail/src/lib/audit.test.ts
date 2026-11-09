import { describe, expect, it } from 'vitest'
import { redact } from '@/lib/audit'
import { isAdmin } from '@/lib/admin'

describe('redact : aucun secret dans le journal d’audit', () => {
  it('masque les clés sensibles, à toute profondeur', () => {
    const out = redact({
      reason: 'abus',
      password: 'hunter2',
      nested: { apiKey: 'sk_live_x', token: 't', Authorization: 'Bearer x', ok: 1 },
      list: [{ secret: 's', fine: 'oui' }],
      envVar: { key: 'DATABASE_URL', value: 'postgres://u:p@h/db' },
    }) as Record<string, unknown> & { nested: Record<string, unknown>; list: Record<string, unknown>[]; envVar: Record<string, unknown> }
    expect(out.reason).toBe('abus')
    expect(out.password).toBe('[masqué]')
    expect(out.nested).toEqual({ apiKey: '[masqué]', token: '[masqué]', Authorization: '[masqué]', ok: 1 })
    expect(out.list[0]).toEqual({ secret: '[masqué]', fine: 'oui' })
    expect(out.envVar.value).toBe('[masqué]')
    expect(JSON.stringify(out)).not.toMatch(/hunter2|sk_live|postgres:\/\//)
  })

  it('tronque les textes très longs et borne la profondeur', () => {
    expect((redact('x'.repeat(2000)) as string).length).toBeLessThan(600)
    let deep: Record<string, unknown> = { v: 1 }
    for (let i = 0; i < 10; i++) deep = { a: deep }
    expect(JSON.stringify(redact(deep))).toContain('profondeur max')
  })
})

describe('isAdmin', () => {
  const s = (user: object) => ({ user }) as unknown as Parameters<typeof isAdmin>[0]
  it('accepte uniquement un administrateur non suspendu', () => {
    expect(isAdmin(s({ role: 'admin', banned: false }))).toBe(true)
    expect(isAdmin(s({ role: 'admin', banned: true }))).toBe(false)
    expect(isAdmin(s({ role: 'user' }))).toBe(false)
    expect(isAdmin(s({}))).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})
