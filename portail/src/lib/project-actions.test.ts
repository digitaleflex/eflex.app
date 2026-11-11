import { describe, expect, it } from 'vitest'
import { nextProjectAction, projectSituation } from '@/lib/project-actions'

describe('projectSituation', () => {
  it('distingue jamais déployé, échec, en cours, en ligne et annulé', () => {
    expect(projectSituation(null, false)).toBe('never')
    expect(projectSituation('queued', false)).toBe('never')
    expect(projectSituation('failed', true)).toBe('failed')
    expect(projectSituation('building', true)).toBe('in-progress')
    expect(projectSituation('live', true)).toBe('live')
    expect(projectSituation('cancelled', true)).toBe('idle')
    expect(projectSituation('rollbacked', true)).toBe('idle')
  })
})

describe('nextProjectAction', () => {
  const action = (situation: Parameters<typeof nextProjectAction>[0]['situation'], canManage: boolean, domain: string | null = null) =>
    nextProjectAction({ projectId: 'p1', situation, domain, canManage })

  it('propose de lire les journaux après un échec, quel que soit le rôle', () => {
    expect(action('failed', true)).toMatchObject({ kind: 'logs', href: '/dashboard/projects/p1?tab=deployments' })
    expect(action('failed', false)?.kind).toBe('logs')
  })

  it('propose de suivre un déploiement en cours', () => {
    expect(action('in-progress', true)).toMatchObject({ kind: 'follow', label: 'Suivre le déploiement' })
  })

  it('ne propose de déployer un projet jamais déployé qu’aux rôles gestionnaires', () => {
    expect(action('never', true)).toEqual({ kind: 'deploy', label: 'Lancer le déploiement' })
    expect(action('never', false)).toBeNull()
  })

  it('met en avant le site quand le projet est en ligne avec un domaine', () => {
    expect(action('live', true, 'app.eflex.app')).toEqual({
      kind: 'visit',
      label: 'Ouvrir le site',
      href: 'https://app.eflex.app',
      external: true,
    })
  })

  it('retombe sur le redéploiement sans domaine, ou sur rien pour un membre', () => {
    expect(action('live', true, null)).toMatchObject({ kind: 'redeploy', label: 'Redéployer' })
    expect(action('live', false, null)).toBeNull()
  })

  it('relance un déploiement annulé si le rôle le permet, sinon renvoie aux journaux', () => {
    expect(action('idle', true)?.kind).toBe('redeploy')
    expect(action('idle', false)).toMatchObject({ kind: 'logs' })
  })
})
