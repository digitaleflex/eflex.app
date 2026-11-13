import { describe, expect, it } from 'vitest'
import {
  PALETTE_ACTIONS,
  PALETTE_EMPTY_QUERY_PROJECT_LIMIT,
  buildProjectItems,
  filterPaletteItems,
  type PaletteProject,
} from '@/lib/command-palette-items'

const projects: PaletteProject[] = [
  { id: 'p1', name: 'Boutique', domain: 'boutique.eflex.app' },
  {
    id: 'p2',
    name: 'Blog',
    domain: null,
    apps: [
      { id: 'a2', name: 'web', position: 1, domain: 'web.blog.eflex.app' },
      { id: 'a1', name: 'api', position: 0, domain: 'api.blog.eflex.app' },
    ],
  },
]

describe('buildProjectItems', () => {
  it('ne crée que la navigation pour un rôle sans gestion de projets', () => {
    const items = buildProjectItems(projects, false)
    expect(items.map((i) => i.id)).toEqual(['project:p1', 'project:p2'])
    expect(items.some((i) => i.action === 'redeploy')).toBe(false)
  })

  it('ajoute redéploiement, journaux et domaine par projet quand la gestion est permise', () => {
    const items = buildProjectItems(projects, true)
    expect(items.filter((i) => i.projectId === 'p1' || i.id.startsWith('project:p1')).map((i) => i.id)).toEqual([
      'project:p1',
      'project:p1:redeploy',
      'project:p1:logs',
      'project:p1:domain',
    ])
    const redeploy = items.find((i) => i.id === 'project:p2:redeploy')
    expect(redeploy).toMatchObject({ action: 'redeploy', projectId: 'p2', projectName: 'Blog', group: 'Projets' })
    expect(items.find((i) => i.id === 'project:p2:logs')?.href).toBe('/dashboard/projects/p2?tab=deployments')
    expect(items.find((i) => i.id === 'project:p2:domain')?.href).toBe('/dashboard/projects/p2/settings#domaines')
  })

  it("utilise le domaine de l'application principale (position la plus basse)", () => {
    const items = buildProjectItems(projects, false)
    expect(items.find((i) => i.id === 'project:p2')?.hint).toBe('api.blog.eflex.app')
    expect(items.find((i) => i.id === 'project:p1')?.hint).toBe('boutique.eflex.app')
  })

  it("n'invente aucun indice sans domaine", () => {
    const items = buildProjectItems([{ id: 'p3', name: 'Nu', domain: null }], false)
    expect(items[0]?.hint).toBeUndefined()
  })

  it('donne à chaque entrée un identifiant unique', () => {
    const ids = buildProjectItems(projects, true).map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('filterPaletteItems', () => {
  const projectItems = buildProjectItems(projects, true)

  it('ignore la casse et les espaces autour de la requête', () => {
    const result = filterPaletteItems('  BOUTIQUE ', projectItems)
    expect(result.every((i) => i.label.toLowerCase().includes('boutique') || i.hint?.toLowerCase().includes('boutique'))).toBe(true)
    expect(result.map((i) => i.id)).toContain('project:p1')
  })

  it('range les projets avant les actions quand une requête existe', () => {
    const result = filterPaletteItems('projet', projectItems)
    const firstAction = result.findIndex((i) => i.group === 'Actions')
    const lastProject = result.map((i) => i.group).lastIndexOf('Projets')
    expect(firstAction).toBeGreaterThan(-1)
    expect(lastProject).toBeLessThan(firstAction)
  })

  it('retrouve les actions par projet via son nom', () => {
    const ids = filterPaletteItems('blog', projectItems).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['project:p2', 'project:p2:redeploy', 'project:p2:logs', 'project:p2:domain']))
  })

  it('retrouve une action par son indice', () => {
    const ids = filterPaletteItems('préférences', []).map((i) => i.id)
    expect(ids).toEqual(['notifications'])
  })

  it('renvoie une liste vide sans correspondance', () => {
    expect(filterPaletteItems('zzzz-introuvable', projectItems)).toEqual([])
  })

  it('sans requête, limite les projets mais garde toutes les actions', () => {
    const many = buildProjectItems(
      Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, name: `Projet ${i}`, domain: null })),
      false,
    )
    const result = filterPaletteItems('', many)
    expect(result.filter((i) => i.group === 'Projets')).toHaveLength(PALETTE_EMPTY_QUERY_PROJECT_LIMIT)
    expect(result.filter((i) => i.group === 'Actions')).toHaveLength(PALETTE_ACTIONS.length)
  })
})
