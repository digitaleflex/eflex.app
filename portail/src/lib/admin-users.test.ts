import { describe, expect, it } from 'vitest'
import {
  isUserListFiltered,
  parseUserListQuery,
  userListHref,
  userListHrefTemplate,
  userListWhere,
  userRoleLabel,
  userSuspensionLabel,
  userVerificationLabel,
} from './admin-users'

describe('recherche et filtres des utilisateurs', () => {
  it('normalise les paramètres d’URL', () => {
    expect(parseUserListQuery({})).toEqual({
      query: '',
      role: 'all',
      status: 'all',
      verification: 'all',
      page: 1,
    })
    expect(parseUserListQuery({ role: 'inconnu', statut: 'x', email: 'y', page: '-4' })).toMatchObject({
      role: 'all',
      status: 'all',
      verification: 'all',
      page: 1,
    })
    expect(parseUserListQuery({ q: '  awa ', role: 'admin', statut: 'suspended', email: 'unverified', page: '3' })).toEqual({
      query: 'awa',
      role: 'admin',
      status: 'suspended',
      verification: 'unverified',
      page: 3,
    })
  })

  it('cumule les restrictions Prisma', () => {
    expect(userListWhere(parseUserListQuery({}))).toEqual({})

    const search = userListWhere(parseUserListQuery({ q: 'test' }))
    expect(search.OR).toHaveLength(2)

    const combined = userListWhere(
      parseUserListQuery({ q: 'test', role: 'admin', statut: 'suspended', email: 'verified' }),
    )
    expect(combined).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        { role: 'admin' },
        { banned: true },
        { emailVerified: true },
      ],
    })
  })

  it('traite les comptes sans rôle comme des comptes standard', () => {
    expect(userListWhere(parseUserListQuery({ role: 'member' }))).toEqual({
      OR: [{ role: null }, { role: { not: 'admin' } }],
    })
  })

  it('construit des liens qui conservent les filtres', () => {
    const query = parseUserListQuery({ q: 'test', role: 'admin', statut: 'suspended', page: '2' })
    expect(isUserListFiltered(query)).toBe(true)
    expect(isUserListFiltered(parseUserListQuery({}))).toBe(false)
    expect(userListHref(query, { role: 'all' })).toBe('/admin/users?q=test&statut=suspended&page=2')
    expect(userListHref(parseUserListQuery({ statut: 'suspended' }), { page: 1 })).toBe(
      '/admin/users?statut=suspended',
    )
    expect(userListHrefTemplate(query)).toBe('/admin/users?q=test&role=admin&statut=suspended&page=')
  })

  it('distingue rôle, vérification et suspension', () => {
    expect(userRoleLabel('admin')).toBe('Administrateur')
    expect(userRoleLabel('user')).toBe('Compte standard')
    expect(userRoleLabel(null)).toBe('Compte standard')
    expect(userSuspensionLabel(true)).toBe('Suspendu')
    expect(userSuspensionLabel(false)).toBe('Actif')
    expect(userVerificationLabel(true)).toBe('Vérifié')
    expect(userVerificationLabel(false)).toBe('Non vérifié')
  })
})
