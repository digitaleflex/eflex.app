import { describe, expect, it } from 'vitest'
import type { DatabaseBackupSchedule } from '@/lib/coolify'
import {
  DEFAULT_BACKUP_FREQUENCY,
  backupNeedsAlert,
  backupSettings,
  backupSupported,
  restoreSourceFor,
  summarizeBackups,
  toPublicExecution,
} from '@/lib/database-backups'
import { describeFrequency, formatBytes } from '@/components/database-backups'

const NOW = new Date('2026-11-16T12:00:00Z')
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

type ExecInput = Pick<DatabaseBackupSchedule['executions'][number], 'id' | 'status' | 'size' | 'createdAt'> &
  Partial<DatabaseBackupSchedule['executions'][number]>

function schedule(executions: ExecInput[], saveS3 = true): DatabaseBackupSchedule {
  return {
    id: 'sched',
    frequency: '0 2 * * *',
    enabled: true,
    saveS3,
    executions: executions.map((execution) => ({ filename: null, localDeleted: false, s3Uploaded: false, ...execution })),
  }
}

describe('backupSettings', () => {
  it('applique des valeurs par défaut prudentes sans configuration', () => {
    expect(backupSettings({})).toEqual({
      frequency: DEFAULT_BACKUP_FREQUENCY,
      retentionLocal: 3,
      retentionS3: 14,
      maxAgeHours: 26,
    })
  })

  it('lit le stockage S3, une fréquence cron ou un mot-clé, et borne les rétentions', () => {
    const settings = backupSettings({
      COOLIFY_BACKUP_S3_STORAGE_UUID: ' s3-uuid ',
      DATABASE_BACKUP_FREQUENCY: '30 4 * * *',
      DATABASE_BACKUP_RETENTION_LOCAL: '0',
      DATABASE_BACKUP_RETENTION_S3: '9999',
    })
    expect(settings.s3StorageUuid).toBe('s3-uuid')
    expect(settings.frequency).toBe('30 4 * * *')
    expect(settings.retentionLocal).toBe(1)
    expect(settings.retentionS3).toBe(365)
    expect(backupSettings({ DATABASE_BACKUP_FREQUENCY: 'hourly' }).frequency).toBe('hourly')
  })

  it('refuse une fréquence invalide (every_minute surchargerait le serveur)', () => {
    expect(backupSettings({ DATABASE_BACKUP_FREQUENCY: 'every_minute' }).frequency).toBe(DEFAULT_BACKUP_FREQUENCY)
    expect(backupSettings({ DATABASE_BACKUP_FREQUENCY: 'n’importe quoi' }).frequency).toBe(DEFAULT_BACKUP_FREQUENCY)
  })
})

describe('backupSupported', () => {
  it('ne concerne que PostgreSQL (Coolify ne sauvegarde pas Redis)', () => {
    expect(backupSupported('postgresql')).toBe(true)
    expect(backupSupported('redis')).toBe(false)
  })
})

describe('summarizeBackups', () => {
  it('« never » sans aucune exécution', () => {
    const summary = summarizeBackups([schedule([])], NOW, 26)
    expect(summary.health).toBe('never')
    expect(summary.lastSuccessAt).toBeNull()
    expect(summary.offsite).toBe(true)
  })

  it('« ok » quand la dernière sauvegarde a réussi récemment', () => {
    const summary = summarizeBackups(
      [schedule([{ id: 'a', status: 'success', size: 2048, createdAt: hoursAgo(10) }])],
      NOW,
      26,
    )
    expect(summary.health).toBe('ok')
    expect(summary.lastSuccessAt).toBe(hoursAgo(10))
  })

  it('« failed » quand la plus récente a échoué, même après des réussites', () => {
    const summary = summarizeBackups(
      [
        schedule([
          { id: 'old', status: 'success', size: 1, createdAt: hoursAgo(30) },
          { id: 'new', status: 'failed', size: null, createdAt: hoursAgo(6) },
        ]),
      ],
      NOW,
      26,
    )
    expect(summary.health).toBe('failed')
    expect(summary.recent.map((execution) => execution.id)).toEqual(['new', 'old'])
    expect(summary.lastFailureAt).toBe(hoursAgo(6))
  })

  it('« stale » quand la dernière réussite dépasse le délai', () => {
    const summary = summarizeBackups(
      [schedule([{ id: 'a', status: 'success', size: 1, createdAt: hoursAgo(40) }])],
      NOW,
      26,
    )
    expect(summary.health).toBe('stale')
  })

  it('« running » pendant une sauvegarde, et fusionne plusieurs planifications', () => {
    const summary = summarizeBackups(
      [
        schedule([{ id: 'a', status: 'success', size: 1, createdAt: hoursAgo(20) }], false),
        schedule([{ id: 'b', status: 'running', size: null, createdAt: hoursAgo(0.1) }], false),
      ],
      NOW,
      26,
    )
    expect(summary.health).toBe('running')
    expect(summary.offsite).toBe(false)
  })

  it('limite l’historique renvoyé', () => {
    const executions = Array.from({ length: 15 }, (_, index) => ({
      id: `e${index}`,
      status: 'success' as const,
      size: 1,
      createdAt: hoursAgo(index),
    }))
    expect(summarizeBackups([schedule(executions)], NOW, 26).recent).toHaveLength(10)
  })
})

describe('backupNeedsAlert', () => {
  it('alerte tout de suite sur un échec ou une sauvegarde trop ancienne', () => {
    expect(backupNeedsAlert({ health: 'failed' }, null, NOW, 26)).toBe(true)
    expect(backupNeedsAlert({ health: 'stale' }, null, NOW, 26)).toBe(true)
  })

  it('laisse le temps à la première sauvegarde avant d’alerter', () => {
    expect(backupNeedsAlert({ health: 'never' }, new Date(hoursAgo(5)), NOW, 26)).toBe(false)
    expect(backupNeedsAlert({ health: 'never' }, new Date(hoursAgo(30)), NOW, 26)).toBe(true)
  })

  it('n’alerte pas quand tout va bien', () => {
    expect(backupNeedsAlert({ health: 'ok' }, new Date(hoursAgo(100)), NOW, 26)).toBe(false)
    expect(backupNeedsAlert({ health: 'running' }, new Date(hoursAgo(100)), NOW, 26)).toBe(false)
  })
})

describe('affichage', () => {
  it('décrit la fréquence en français', () => {
    expect(describeFrequency('0 2 * * *')).toBe('chaque jour à 02:00 (UTC)')
    expect(describeFrequency('daily')).toBe('chaque jour')
    expect(describeFrequency('0 */6 * * *')).toBe('selon la planification « 0 */6 * * * »')
  })

  it('formate les tailles', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(512)).toBe('512 o')
    expect(formatBytes(1536)).toBe('1,5 Ko')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 Mo')
  })
})

describe('restoreSourceFor', () => {
  const base = { status: 'success' as const, filename: '/data/coolify/backups/databases/t-0/db/pg.dmp' }

  it('préfère le fichier resté sur le serveur', () => {
    expect(restoreSourceFor({ ...base, localDeleted: false, s3Uploaded: true }, 's3-1')).toEqual({
      source: 'server',
      path: base.filename,
    })
  })

  it('se rabat sur la copie S3 quand le fichier local a été purgé', () => {
    expect(restoreSourceFor({ ...base, localDeleted: true, s3Uploaded: true }, 's3-1')).toEqual({
      source: 's3',
      s3StorageUuid: 's3-1',
      path: base.filename,
    })
  })

  it('refuse sans fichier disponible, sans stockage S3, ou pour une sauvegarde en échec', () => {
    expect(restoreSourceFor({ ...base, localDeleted: true, s3Uploaded: true })).toBeNull()
    expect(restoreSourceFor({ ...base, localDeleted: true, s3Uploaded: false }, 's3-1')).toBeNull()
    expect(restoreSourceFor({ ...base, status: 'failed', localDeleted: false, s3Uploaded: false })).toBeNull()
    expect(restoreSourceFor({ status: 'success', filename: null, localDeleted: false, s3Uploaded: false })).toBeNull()
  })

  it('ne renvoie jamais le chemin du fichier à l’interface', () => {
    const view = toPublicExecution({
      id: 'e1',
      status: 'success',
      size: 10,
      createdAt: '2026-11-16T02:00:00Z',
      ...base,
      localDeleted: false,
      s3Uploaded: false,
    })
    expect(view).toEqual({ id: 'e1', status: 'success', size: 10, createdAt: '2026-11-16T02:00:00Z', restorable: true })
    expect(JSON.stringify(view)).not.toContain('/data/')
  })
})
