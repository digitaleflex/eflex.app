import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLATFORM_SETTINGS,
  MAX_ANNOUNCEMENT,
  MAX_MAINTENANCE_MESSAGE,
  PLATFORM_SETTING_KEYS,
  parsePlatformSettings,
  parseSettingsPatch,
} from '@/lib/platform-settings'

describe('parsePlatformSettings', () => {
  it('renvoie les valeurs par défaut sans ligne stockée', () => {
    expect(parsePlatformSettings([])).toEqual(DEFAULT_PLATFORM_SETTINGS)
  })

  it('relit les réglages typés', () => {
    const settings = parsePlatformSettings([
      { key: PLATFORM_SETTING_KEYS.maintenanceEnabled, value: 'true' },
      { key: PLATFORM_SETTING_KEYS.maintenanceMessage, value: 'Migration PostgreSQL' },
      { key: PLATFORM_SETTING_KEYS.signupsEnabled, value: 'false' },
      { key: PLATFORM_SETTING_KEYS.announcement, value: 'Nouvelle console disponible' },
      { key: PLATFORM_SETTING_KEYS.announcementLevel, value: 'warning' },
    ])
    expect(settings).toEqual({
      maintenanceEnabled: true,
      maintenanceMessage: 'Migration PostgreSQL',
      signupsEnabled: false,
      announcement: 'Nouvelle console disponible',
      announcementLevel: 'warning',
    })
  })

  it('ignore les valeurs illisibles et garde les défauts', () => {
    const settings = parsePlatformSettings([
      { key: PLATFORM_SETTING_KEYS.maintenanceEnabled, value: 'peut-être' },
      { key: PLATFORM_SETTING_KEYS.signupsEnabled, value: 'TRUE' },
    ])
    expect(settings.maintenanceEnabled).toBe(false)
    expect(settings.signupsEnabled).toBe(true)
  })
})

describe('parseSettingsPatch', () => {
  it('accepte une modification partielle valide', () => {
    const result = parseSettingsPatch({ maintenanceEnabled: true, maintenanceMessage: '  Travaux  ' })
    expect(result).toEqual({ ok: true, value: { maintenanceEnabled: true, maintenanceMessage: 'Travaux' } })
  })

  it('refuse les clés inconnues (pas d’écriture arbitraire)', () => {
    expect(parseSettingsPatch({ autre: 1 })).toMatchObject({ ok: false })
    expect(parseSettingsPatch({ 'github.app.privateKey': 'x' })).toMatchObject({ ok: false })
  })

  it('refuse les types invalides et les corps vides', () => {
    expect(parseSettingsPatch({ maintenanceEnabled: 'oui' })).toMatchObject({ ok: false })
    expect(parseSettingsPatch({ signupsEnabled: 0 })).toMatchObject({ ok: false })
    expect(parseSettingsPatch({ announcement: 42 })).toMatchObject({ ok: false })
    expect(parseSettingsPatch({ announcementLevel: 'danger' })).toMatchObject({ ok: false })
    expect(parseSettingsPatch({})).toMatchObject({ ok: false })
    expect(parseSettingsPatch(null)).toMatchObject({ ok: false })
    expect(parseSettingsPatch([])).toMatchObject({ ok: false })
  })

  it('borne la longueur des messages', () => {
    expect(parseSettingsPatch({ maintenanceMessage: 'x'.repeat(MAX_MAINTENANCE_MESSAGE + 1) })).toMatchObject({
      ok: false,
    })
    expect(parseSettingsPatch({ announcement: 'x'.repeat(MAX_ANNOUNCEMENT + 1) })).toMatchObject({ ok: false })
    expect(parseSettingsPatch({ maintenanceMessage: 'x'.repeat(MAX_MAINTENANCE_MESSAGE) })).toMatchObject({ ok: true })
  })
})
