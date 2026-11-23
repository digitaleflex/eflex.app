import { describe, expect, it } from 'vitest'
import { blockingIssues, preflightChecks } from './deploy-preflight'

const ok = { repoUrl: 'https://github.com/acme/boutique', branch: 'main', framework: 'nextjs', envKeys: [] }

describe('pré-vérifications de déploiement (#164)', () => {
  it('ne signale rien pour un projet sain', () => {
    expect(preflightChecks(ok)).toEqual([])
  })

  it('bloque une adresse de dépôt non GitHub avec une action concrète', () => {
    const issues = preflightChecks({ ...ok, repoUrl: 'https://gitlab.com/acme/boutique' })
    expect(blockingIssues(issues)).toEqual([expect.objectContaining({ code: 'repo-url', action: expect.stringContaining('Réglages') })])
  })

  it('bloque un nom de branche invalide', () => {
    expect(blockingIssues(preflightChecks({ ...ok, branch: '-rm -rf' }))[0]).toMatchObject({ code: 'branch' })
    expect(blockingIssues(preflightChecks({ ...ok, branch: 'feat/ok' }))).toEqual([])
  })

  it('ne contrôle ni dépôt ni branche pour un projet issu d’une image Docker', () => {
    expect(preflightChecks({ ...ok, repoUrl: 'docker-image://nginx:1.27', branch: '' })).toEqual([])
  })

  it('avertit sans bloquer quand Laravel n’a pas APP_KEY', () => {
    const issues = preflightChecks({ ...ok, framework: 'laravel' })
    expect(issues).toEqual([expect.objectContaining({ code: 'laravel-app-key', level: 'warning' })])
    expect(blockingIssues(issues)).toEqual([])
    expect(preflightChecks({ ...ok, framework: 'laravel', envKeys: ['APP_KEY'] })).toEqual([])
  })

  it('le message n’expose jamais de valeur de variable', () => {
    const text = JSON.stringify(preflightChecks({ ...ok, framework: 'laravel', envKeys: ['SECRET_TOKEN'] }))
    expect(text).not.toContain('SECRET_TOKEN')
  })

  it('avertit quand le plan déclare des volumes alors que la persistance est désactivée (#162)', () => {
    const issues = preflightChecks({ ...ok, volumeMounts: ['/app/storage', '/app/uploads'], persistentVolumesEnabled: false })
    expect(issues).toEqual([expect.objectContaining({ code: 'volumes-not-persisted', level: 'warning' })])
    expect(issues[0]!.message).toContain('/app/storage')
    expect(blockingIssues(issues)).toEqual([])
  })

  it('ne dit rien quand les volumes sont réellement créés ou qu’il n’y en a pas', () => {
    expect(preflightChecks({ ...ok, volumeMounts: ['/app/storage'], persistentVolumesEnabled: true })).toEqual([])
    expect(preflightChecks({ ...ok, volumeMounts: [], persistentVolumesEnabled: false })).toEqual([])
    expect(preflightChecks({ ...ok })).toEqual([])
  })
})
