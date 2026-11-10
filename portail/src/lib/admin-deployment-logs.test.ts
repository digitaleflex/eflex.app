import { describe, expect, it } from 'vitest'
import { maskProjectLogs, readableSecrets } from './admin-deployment-logs'

const PROJECT = 'projet-1'

describe('masquage des journaux vus depuis l’administration', () => {
  it('remplace chaque valeur connue, la plus longue d’abord', () => {
    const variables = [
      { key: 'API_KEY', value: 'secret-tres-long-0123' },
      { key: 'MOT_DE_PASSE', value: 'motdepasse' },
    ]
    const logs = 'build: token=secret-tres-long-0123 motdepasse secret-tres-long-0123'
    const masked = maskProjectLogs(PROJECT, variables, logs)
    expect(masked).not.toContain('secret-tres-long-0123')
    expect(masked).not.toContain('motdepasse')
    expect(masked).toContain('***')
  })

  it('ignore une variable illisible au lieu de faire échouer la lecture', () => {
    const variables = [
      { key: 'CASSE', value: 'v1:pas-un-nonce:pas-un-payload' },
      { key: 'OK', value: 'valeur-lisible' },
    ]
    expect(readableSecrets(PROJECT, variables)).toEqual(['valeur-lisible'])
    expect(maskProjectLogs(PROJECT, variables, 'valeur-lisible')).toBe('***')
  })

  it('renvoie une chaîne vide sans journal', () => {
    expect(maskProjectLogs(PROJECT, [], null)).toBe('')
    expect(maskProjectLogs(PROJECT, [], undefined)).toBe('')
  })
})
