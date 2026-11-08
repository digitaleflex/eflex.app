import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './project-slug'

describe('slugify', () => {
  it('normalise les accents, la casse et les espaces', () => {
    expect(slugify('Mon Projet Épatant')).toBe('mon-projet-epatant')
  })

  it('supprime les caractères spéciaux et les tirets superflus', () => {
    expect(slugify('  API / v2 !!  ')).toBe('api-v2')
  })

  it('borne la longueur et fournit un repli pour un nom vide', () => {
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(40)
    expect(slugify('')).toBe('projet')
    expect(slugify('---')).toBe('projet')
  })
})

describe('uniqueSlug', () => {
  it('garde le nom seul quand il est libre', async () => {
    expect(await uniqueSlug('Mon Projet', async () => false)).toBe('mon-projet')
  })

  it('ajoute un suffixe quand le slug existe déjà (pas de 500)', async () => {
    let calls = 0
    const slug = await uniqueSlug('Mon Projet', async () => {
      calls += 1
      return calls === 1 // base prise, puis libre
    })
    expect(slug).toMatch(/^mon-projet-[0-9a-f]{4}$/)
    expect(slug).not.toBe('mon-projet')
  })

  it('retombe sur un suffixe long si toutes les tentatives échouent', async () => {
    const slug = await uniqueSlug('Mon Projet', async () => true)
    expect(slug).toMatch(/^mon-projet-[0-9a-f]{8}$/)
  })

  it('deux projets au même nom produisent des slugs distincts', async () => {
    const taken = new Set<string>()
    const make = () => uniqueSlug('Mon Projet', async (s) => {
      if (taken.has(s)) return true
      taken.add(s)
      return false
    })
    const first = await make()
    const second = await make()
    expect(first).not.toBe(second)
  })
})
