import { describe, expect, it } from 'vitest'
import {
  PROJECT_FILTERS,
  projectFilterCounts,
  selectProjects,
  type ExplorerProject,
} from '@/lib/project-explorer'

const project = (overrides: Partial<ExplorerProject> & { id: string }): ExplorerProject => ({
  name: overrides.id,
  domain: null,
  repoUrl: `https://github.com/eflex/${overrides.id}`,
  framework: 'nextjs',
  lastStatus: 'live',
  lastAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
})

const projects: ExplorerProject[] = [
  project({ id: 'boutique', name: 'Boutique', domain: 'boutique.eflex.app', lastStatus: 'live', lastAt: '2026-11-10T09:00:00.000Z' }),
  project({ id: 'api', name: 'API interne', domain: null, framework: 'node', lastStatus: 'failed', lastAt: '2026-11-09T09:00:00.000Z' }),
  project({ id: 'admin', name: 'Admin', lastStatus: 'building', lastAt: '2026-11-11T09:00:00.000Z' }),
  project({ id: 'site', name: 'Site vitrine', framework: 'static', lastStatus: 'live', lastAt: null, updatedAt: '2026-11-08T09:00:00.000Z' }),
  project({ id: 'vide', name: 'Nouveau', lastStatus: null, lastAt: null, updatedAt: '2026-11-07T09:00:00.000Z' }),
]

const ids = (list: ExplorerProject[]) => list.map((item) => item.id)

describe('filtres de l’explorateur', () => {
  it('compte les projets par statut sans modifier la liste', () => {
    expect(projectFilterCounts(projects)).toEqual({ all: 5, live: 2, active: 1, failed: 1 })
    expect(projects).toHaveLength(5)
  })

  it('filtre les déploiements en cours et les échecs', () => {
    expect(ids(selectProjects(projects, { filter: 'active' }))).toEqual(['admin'])
    expect(ids(selectProjects(projects, { filter: 'failed' }))).toEqual(['api'])
    expect(ids(selectProjects(projects, { filter: 'live' }))).toEqual(['boutique', 'site'])
  })

  it('expose des filtres nommés et stables', () => {
    expect(PROJECT_FILTERS.map((filter) => filter.id)).toEqual(['all', 'live', 'active', 'failed'])
  })
})

describe('recherche de l’explorateur', () => {
  it('cherche dans le nom, le domaine, le dépôt et le libellé de stack', () => {
    expect(ids(selectProjects(projects, { query: 'boutique.eflex' }))).toEqual(['boutique'])
    expect(ids(selectProjects(projects, { query: 'eflex/api' }))).toEqual(['api'])
    expect(ids(selectProjects(projects, { query: 'site statique' }))).toEqual(['site'])
    expect(ids(selectProjects(projects, { query: '  admin  ' }))).toEqual(['admin'])
  })

  it('combine recherche et filtre', () => {
    expect(selectProjects(projects, { query: 'site', filter: 'failed' })).toEqual([])
  })
})

describe('tri de l’explorateur', () => {
  it('trie par nom en français', () => {
    expect(ids(selectProjects(projects, { sort: 'name' }))).toEqual(['admin', 'api', 'boutique', 'vide', 'site'])
  })

  it('place les échecs puis les déploiements en cours, puis les autres', () => {
    expect(ids(selectProjects(projects, { sort: 'status' }))).toEqual(['api', 'admin', 'boutique', 'vide', 'site'])
  })

  it('trie par activité récente et retombe sur updatedAt sans déploiement', () => {
    expect(ids(selectProjects(projects, { sort: 'recent' }))).toEqual(['admin', 'boutique', 'api', 'site', 'vide'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const original = [...projects]
    selectProjects(projects, { sort: 'name', filter: 'live' })
    expect(projects).toEqual(original)
  })
})
