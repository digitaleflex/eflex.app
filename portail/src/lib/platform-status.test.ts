import { describe, expect, it } from 'vitest'
import { buildPlatformStatus, failedDeploymentsLevel } from './platform-status'

const healthy = {
  infrastructure: [
    { key: 'database', label: 'Base de données', level: 'ok' as const, detail: null },
    { key: 'queue', label: 'File de déploiements', level: 'ok' as const, detail: null },
  ],
  failedDeployments24h: 0,
  openSiteIncidents: 0,
  databasesWithoutBackup: 0,
}

describe('buildPlatformStatus', () => {
  it('tout va bien : niveau global ok', () => {
    const status = buildPlatformStatus(healthy)
    expect(status.overall).toBe('ok')
    expect(status.rows).toHaveLength(5)
    expect(status.rows.every((row) => row.href.startsWith('/admin/'))).toBe(true)
  })

  it("une source critique rend l'ensemble critique", () => {
    const status = buildPlatformStatus({
      ...healthy,
      infrastructure: [{ key: 'queue', label: 'File', level: 'danger', detail: 'Redis injoignable' }],
    })
    expect(status.overall).toBe('danger')
    expect(status.rows[0]).toMatchObject({ level: 'danger', detail: 'Redis injoignable' })
  })

  it("collecte impossible : jamais « tout va bien »", () => {
    const status = buildPlatformStatus({ ...healthy, infrastructure: null })
    expect(status.overall).toBe('unknown')
    expect(status.rows[0]).toMatchObject({ key: 'infrastructure', level: 'unknown' })
  })

  it('incidents et bases sans sauvegarde passent en « à surveiller »', () => {
    const status = buildPlatformStatus({ ...healthy, openSiteIncidents: 2, databasesWithoutBackup: 1 })
    expect(status.overall).toBe('warning')
    const byKey = Object.fromEntries(status.rows.map((row) => [row.key, row]))
    expect(byKey['site-incidents']).toMatchObject({ level: 'warning', detail: '2 incidents ouverts' })
    expect(byKey['backups']).toMatchObject({ level: 'warning', detail: '1 base sans sauvegarde planifiée' })
  })

  it('seuils des déploiements en échec', () => {
    expect(failedDeploymentsLevel(0)).toBe('ok')
    expect(failedDeploymentsLevel(1)).toBe('warning')
    expect(failedDeploymentsLevel(4)).toBe('warning')
    expect(failedDeploymentsLevel(5)).toBe('danger')
  })
})
