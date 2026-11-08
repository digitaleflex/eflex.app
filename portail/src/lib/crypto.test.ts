import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CryptoConfigError, assertCryptoConfig, decrypt, encrypt, isEncrypted } from './crypto'

const KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 3).toString('base64')
const AAD = 'project-42:API_TOKEN'

let savedKey: string | undefined
let savedPrevious: string | undefined

beforeEach(() => {
  savedKey = process.env.ENV_ENCRYPTION_KEY
  savedPrevious = process.env.ENV_ENCRYPTION_KEY_PREVIOUS
  process.env.ENV_ENCRYPTION_KEY = KEY
  delete process.env.ENV_ENCRYPTION_KEY_PREVIOUS
})

afterEach(() => {
  if (savedKey === undefined) delete process.env.ENV_ENCRYPTION_KEY
  else process.env.ENV_ENCRYPTION_KEY = savedKey
  if (savedPrevious === undefined) delete process.env.ENV_ENCRYPTION_KEY_PREVIOUS
  else process.env.ENV_ENCRYPTION_KEY_PREVIOUS = savedPrevious
})

describe('encrypt / decrypt', () => {
  it('effectue un aller-retour et préfixe la version', () => {
    const stored = encrypt('sk-secret-123', AAD)
    expect(isEncrypted(stored)).toBe(true)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(decrypt(stored, AAD)).toBe('sk-secret-123')
  })

  it('gère les valeurs vides et les caractères non ASCII', () => {
    expect(decrypt(encrypt('', AAD), AAD)).toBe('')
    expect(decrypt(encrypt('clé 🔐 = été', AAD), AAD)).toBe('clé 🔐 = été')
  })

  it('utilise un nonce différent à chaque chiffrement', () => {
    expect(encrypt('même valeur', AAD)).not.toBe(encrypt('même valeur', AAD))
  })

  it("rejette une AAD différente (valeur déplacée vers une autre variable)", () => {
    const stored = encrypt('secret', 'project-42:API_TOKEN')
    expect(() => decrypt(stored, 'project-42:OTHER_KEY')).toThrow()
  })

  it('détecte une altération du ciphertext', () => {
    const [version, nonce, payload] = encrypt('secret', AAD).split(':')
    const tampered = Buffer.from(payload, 'base64')
    tampered[0] ^= 0xff
    expect(() => decrypt(`${version}:${nonce}:${tampered.toString('base64')}`, AAD)).toThrow()
  })

  it('détecte une altération du tag', () => {
    const [version, nonce, payload] = encrypt('secret', AAD).split(':')
    const tampered = Buffer.from(payload, 'base64')
    tampered[tampered.length - 1] ^= 0xff
    expect(() => decrypt(`${version}:${nonce}:${tampered.toString('base64')}`, AAD)).toThrow()
  })

  it('rejette une valeur chiffrée avec une autre clé', () => {
    const stored = encrypt('secret', AAD)
    process.env.ENV_ENCRYPTION_KEY = OTHER_KEY
    expect(() => decrypt(stored, AAD)).toThrow()
  })

  it('accepte la clé précédente pendant une rotation', () => {
    const stored = encrypt('secret', AAD)
    process.env.ENV_ENCRYPTION_KEY_PREVIOUS = KEY
    process.env.ENV_ENCRYPTION_KEY = OTHER_KEY
    expect(decrypt(stored, AAD)).toBe('secret')
  })

  it('laisse passer les valeurs historiques en clair (migration)', () => {
    expect(decrypt('ancienne-valeur-en-clair', AAD)).toBe('ancienne-valeur-en-clair')
  })

  it('rejette un format malformé', () => {
    expect(() => decrypt('v1:nonce', AAD)).toThrow()
    expect(() => decrypt('v1:AAAA:AAAA', AAD)).toThrow()
  })
})

describe('assertCryptoConfig', () => {
  it('passe avec une clé valide', () => {
    expect(() => assertCryptoConfig()).not.toThrow()
  })

  it('échoue sans clé', () => {
    delete process.env.ENV_ENCRYPTION_KEY
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigError)
  })

  it('échoue avec une clé de taille incorrecte', () => {
    process.env.ENV_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
    expect(() => assertCryptoConfig()).toThrow(CryptoConfigError)
  })
})
