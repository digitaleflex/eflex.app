/**
 * Chiffrement authentifié des variables d'environnement au repos (issue 04).
 *
 * Format stocké : `v1:<nonce base64>:<ciphertext+tag base64>`.
 * La clé maître vit hors de la base (`ENV_ENCRYPTION_KEY`, 32 octets base64).
 * Les données associées (AAD) `projectId:key` empêchent de déplacer une
 * valeur chiffrée d'une variable vers une autre.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

export class CryptoConfigError extends Error {}

function parseKey(raw: string | undefined, name: string): Buffer {
  if (!raw) {
    throw new CryptoConfigError(
      `${name} est absente. Générez une clé avec : openssl rand -base64 32`,
    )
  }
  const key = Buffer.from(raw.trim(), 'base64')
  if (key.length !== KEY_BYTES) {
    throw new CryptoConfigError(`${name} est invalide : 32 octets encodés en base64 sont attendus.`)
  }
  return key
}

/** Clé courante (chiffrement et déchiffrement). */
function currentKey(): Buffer {
  return parseKey(process.env.ENV_ENCRYPTION_KEY, 'ENV_ENCRYPTION_KEY')
}

/** Clé précédente, utilisée uniquement pour la rotation. */
function previousKey(): Buffer | null {
  return process.env.ENV_ENCRYPTION_KEY_PREVIOUS
    ? parseKey(process.env.ENV_ENCRYPTION_KEY_PREVIOUS, 'ENV_ENCRYPTION_KEY_PREVIOUS')
    : null
}

/** À appeler au démarrage : échoue explicitement si la configuration est absente. */
export function assertCryptoConfig(): void {
  currentKey()
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`)
}

export function encrypt(plaintext: string, aad: string): string {
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGORITHM, currentKey(), nonce)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const payload = Buffer.concat([ciphertext, cipher.getAuthTag()])
  return `${VERSION}:${nonce.toString('base64')}:${payload.toString('base64')}`
}

function decryptWith(stored: string, aad: string, key: Buffer): string {
  const [, nonceB64, payloadB64] = stored.split(':')
  if (!nonceB64 || !payloadB64) throw new Error('Valeur chiffrée malformée.')
  const payload = Buffer.from(payloadB64, 'base64')
  if (payload.length < TAG_BYTES) throw new Error('Valeur chiffrée tronquée.')

  const ciphertext = payload.subarray(0, payload.length - TAG_BYTES)
  const tag = payload.subarray(payload.length - TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(nonceB64, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Déchiffre une valeur. Les valeurs historiques en clair (sans préfixe `v1:`)
 * sont renvoyées telles quelles : le script de migration les convertit.
 */
export function decrypt(stored: string, aad: string): string {
  if (!isEncrypted(stored)) return stored
  try {
    return decryptWith(stored, aad, currentKey())
  } catch (currentError) {
    const previous = previousKey()
    if (!previous) throw currentError
    return decryptWith(stored, aad, previous)
  }
}
