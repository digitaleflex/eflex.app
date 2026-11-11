import { describe, expect, it } from 'vitest'
import {
  appDomain,
  appDomainLabel,
  appNameFromRoot,
  deploymentSlug,
  normalizeAppRoot,
  uniqueAppDomain,
  uniqueAppName,
} from '@/lib/project-apps'

describe('noms et domaines des applications (D2, lot C)', () => {
  it('normalise un dossier sans slash initial ni final', () => {
    expect(normalizeAppRoot('/apps/web/')).toBe('apps/web')
    expect(normalizeAppRoot('')).toBe('')
    expect(normalizeAppRoot(undefined)).toBe('')
  })

  it('déduit un nom stable du dossier', () => {
    expect(appNameFromRoot('apps/web')).toBe('web')
    expect(appNameFromRoot('packages/@acme/ui')).toBe('ui')
    expect(appNameFromRoot('', 'Boutique')).toBe('boutique')
    expect(appNameFromRoot('apps/Été 2026')).toBe('ete-2026')
    expect(appNameFromRoot('apps/' + 'x'.repeat(40))).toHaveLength(24)
  })

  it('déduplique les noms dans le projet', () => {
    expect(uniqueAppName('web', [])).toBe('web')
    expect(uniqueAppName('web', ['web'])).toBe('web-2')
    expect(uniqueAppName('web', ['web', 'web-2'])).toBe('web-3')
  })

  it('construit un domaine secondaire sur un seul label', () => {
    expect(appDomain('shop', 'web', 'eflex.app')).toBe('shop-web.eflex.app')
    expect(appDomain('shop', 'api', 'https://eflex.app/')).toBe('shop-api.eflex.app')
    expect(appDomain('shop', 'web', '')).toBeNull()
    expect(appDomainLabel('a'.repeat(40), 'b'.repeat(24)).length).toBeLessThanOrEqual(63)
    expect(appDomainLabel('a'.repeat(40), 'b'.repeat(24))).not.toMatch(/-$/)
  })

  it('suffixe un domaine déjà pris sans dépasser 63 caractères', async () => {
    const taken = new Set(['shop-web.eflex.app'])
    const exists = async (domain: string) => taken.has(domain)
    await expect(uniqueAppDomain('shop', 'web', 'eflex.app', exists)).resolves.toBe('shop-web-2.eflex.app')

    const long = new Set([appDomain('a'.repeat(40), 'b'.repeat(20), 'eflex.app')!])
    const longDomain = await uniqueAppDomain('a'.repeat(40), 'b'.repeat(20), 'eflex.app', async (domain) =>
      long.has(domain),
    )
    expect(longDomain).not.toBeNull()
    expect(longDomain!.split('.')[0]!.length).toBeLessThanOrEqual(63)
  })
})

describe('deploymentSlug', () => {
  it('garde le slug seul pour une application implicite', () => {
    expect(deploymentSlug('boutique', null)).toBe('boutique')
  })

  it('préfixe le nom pour une application nommée', () => {
    expect(deploymentSlug('boutique', 'web')).toBe('boutique-web')
    expect(deploymentSlug('boutique', 'Été 2026')).toBe('boutique-ete-2026')
  })
})
