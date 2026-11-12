import { describe, expect, it } from 'vitest'
import { diagnoseFailure } from '@/lib/deployment-diagnosis'

describe('deployment-diagnosis', () => {
  it('ne renvoie rien hors échec ou sans journal', () => {
    expect(diagnoseFailure({ status: 'live', logs: 'error', projectId: 'p' })).toBeNull()
    expect(diagnoseFailure({ status: 'failed', logs: '', projectId: 'p' })).toBeNull()
  })

  it('détecte une variable manquante', () => {
    const d = diagnoseFailure({ status: 'failed', logs: 'Error: required environment variable DATABASE_URL not set', projectId: 'p1' })
    expect(d?.action.href).toContain('variables')
  })

  it('détecte un problème de port', () => {
    const d = diagnoseFailure({ status: 'failed', logs: 'No open ports detected', projectId: 'p1' })
    expect(d?.action.label).toContain('port')
  })

  it('détecte un manque de mémoire', () => {
    const d = diagnoseFailure({ status: 'failed', logs: 'FATAL ERROR: JavaScript heap out of memory', projectId: 'p1' })
    expect(d?.action.href).toContain('organization')
  })

  it('détecte un échec de build', () => {
    const d = diagnoseFailure({ status: 'failed', logs: 'npm ERR! code 1\nCommand failed with exit code 1', projectId: 'p1' })
    expect(d?.cause).toContain('build')
  })

  it('détecte un dépôt inaccessible', () => {
    const d = diagnoseFailure({ status: 'failed', logs: 'fatal: could not read from remote repository', projectId: 'p1' })
    expect(d?.cause).toContain('inaccessible')
  })

  it('ne diagnostique pas un journal sans motif connu', () => {
    expect(diagnoseFailure({ status: 'failed', logs: 'quelque chose de totalement différent', projectId: 'p1' })).toBeNull()
  })
})
