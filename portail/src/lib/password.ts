import { createHash } from 'node:crypto'
import { compare, hash } from 'bcryptjs'

/**
 * Hachage des phrases secrètes (issue #55).
 *
 * bcrypt s'arrête à 72 octets : une phrase longue serait silencieusement
 * tronquée, et deux secrets partageant les 72 premiers octets deviendraient
 * équivalents. Les nouveaux secrets sont donc pré-hachés en SHA-256 (44
 * caractères base64, toujours sous la limite) avant bcrypt, et le résultat est
 * préfixé `v2$`.
 *
 * Les hachages existants (bcrypt direct, sans préfixe) restent vérifiés tels
 * quels : aucune migration ni réinitialisation n'est nécessaire pour les
 * comptes créés avant ce changement.
 */

export const PASSWORD_HASH_PREFIX = 'v2$'

/** Coût bcrypt : identique à l'ancien réglage pour ne pas durcir les connexions existantes. */
export const BCRYPT_ROUNDS = 12

/** Empreinte SHA-256 (base64) : 44 octets, sans troncature possible par bcrypt. */
export function prehashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('base64')
}

/** Hache une nouvelle phrase secrète et renvoie la valeur versionnée `v2$…`. */
export async function hashPassword(password: string, rounds = BCRYPT_ROUNDS): Promise<string> {
  const digest = await hash(prehashPassword(password), rounds)
  return `${PASSWORD_HASH_PREFIX}${digest}`
}

/** Vrai pour un hachage produit par la stratégie actuelle. */
export function isVersionedPasswordHash(stored: string): boolean {
  return stored.startsWith(PASSWORD_HASH_PREFIX)
}

/**
 * Vérifie une phrase secrète contre un hachage `v2$…` ou un ancien bcrypt.
 * Ne lève jamais : un hachage illisible est traité comme une non-correspondance.
 */
export async function verifyPassword({
  hash: stored,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  try {
    if (isVersionedPasswordHash(stored)) {
      return await compare(prehashPassword(password), stored.slice(PASSWORD_HASH_PREFIX.length))
    }
    // Ancien format : bcrypt direct, borné à 72 octets à la création.
    return await compare(password, stored)
  } catch {
    return false
  }
}
