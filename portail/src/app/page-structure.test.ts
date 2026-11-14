import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Structure de la page d'accueil. Une fusion de branches a déjà dupliqué toute la section
// « Technologies » (même id, même titre) sans qu'aucun autre test ne le voie : on vérifie donc que
// chaque identifiant et chaque section n'apparaissent qu'une fois.
const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe("page d'accueil", () => {
  it('n’a aucun identifiant HTML en double', () => {
    const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
    const doublons = ids.filter((id, index) => ids.indexOf(id) !== index)
    expect(doublons).toEqual([])
  })

  it('ne répète aucune section', () => {
    const sections = [...page.matchAll(/\{\/\* ─── ([^─]+?) ─── \*\/\}/g)].map((m) => m[1]!.trim())
    expect(sections.length).toBeGreaterThan(3)
    expect(sections.filter((s, index) => sections.indexOf(s) !== index)).toEqual([])
  })
})
