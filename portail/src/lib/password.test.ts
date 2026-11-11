import { hash as bcryptHash } from 'bcryptjs'
import { describe, expect, it } from 'vitest'

import {
  PASSWORD_HASH_PREFIX,
  hashPassword,
  isVersionedPasswordHash,
  prehashPassword,
  verifyPassword,
} from '@/lib/password'

// Coût réduit pour garder la suite rapide ; la production utilise 12 tours.
const TEST_ROUNDS = 4

describe('hachage des phrases secrètes', () => {
  it('produit un hachage versionné v2$', async () => {
    const stored = await hashPassword('givre cuillère renard violon', TEST_ROUNDS)
    expect(stored.startsWith(PASSWORD_HASH_PREFIX)).toBe(true)
    expect(isVersionedPasswordHash(stored)).toBe(true)
    expect(stored.length).toBeGreaterThan(PASSWORD_HASH_PREFIX.length + 20)
  })

  it('vérifie une phrase correcte et refuse une autre', async () => {
    const stored = await hashPassword('givre cuillère renard violon', TEST_ROUNDS)
    await expect(verifyPassword({ hash: stored, password: 'givre cuillère renard violon' })).resolves.toBe(true)
    await expect(verifyPassword({ hash: stored, password: 'givre cuillère renard violon ' })).resolves.toBe(false)
    await expect(verifyPassword({ hash: stored, password: 'autre phrase secrète' })).resolves.toBe(false)
  })

  it('accepte les phrases de plus de 72 octets sans troncature', async () => {
    const base = 'a'.repeat(72)
    const first = `${base}A`
    const second = `${base}B`
    const stored = await hashPassword(first, TEST_ROUNDS)

    await expect(verifyPassword({ hash: stored, password: first })).resolves.toBe(true)
    // Sans pré-hachage, bcrypt ignorerait le 73e octet et accepterait `second`.
    await expect(verifyPassword({ hash: stored, password: second })).resolves.toBe(false)
  })

  it('accepte les espaces et l’Unicode', async () => {
    const passphrase = '  givre cuillère renard violon 🔐  '
    const stored = await hashPassword(passphrase, TEST_ROUNDS)
    await expect(verifyPassword({ hash: stored, password: passphrase })).resolves.toBe(true)
  })

  it('continue de vérifier les anciens hachages bcrypt directs', async () => {
    const legacy = await bcryptHash('motdepasse-existant', TEST_ROUNDS)
    expect(isVersionedPasswordHash(legacy)).toBe(false)
    await expect(verifyPassword({ hash: legacy, password: 'motdepasse-existant' })).resolves.toBe(true)
    await expect(verifyPassword({ hash: legacy, password: 'autre-chose' })).resolves.toBe(false)
  })

  it('traite un hachage illisible comme une non-correspondance', async () => {
    await expect(verifyPassword({ hash: `${PASSWORD_HASH_PREFIX}pas-un-hash`, password: 'secret' })).resolves.toBe(false)
    await expect(verifyPassword({ hash: 'pas-un-hash', password: 'secret' })).resolves.toBe(false)
  })

  it('pré-hache en base64 sous la limite bcrypt', () => {
    const digest = prehashPassword('a'.repeat(1_000))
    expect(digest).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(Buffer.byteLength(digest, 'utf8')).toBeLessThanOrEqual(72)
  })
})
