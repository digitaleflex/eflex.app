/**
 * Validations pures des formulaires d'authentification (issues #55 et #56).
 *
 * Ces règles servent uniquement au retour immédiat dans l'interface : Better
 * Auth reste l'autorité (longueur minimale, hachage, unicité de l'adresse).
 * Aucun secret n'est journalisé ni inclus dans un message d'erreur.
 *
 * La longueur est mesurée en unités UTF-16 (`String.length`), exactement comme
 * Better Auth côté serveur, pour que le client et le serveur comptent pareil.
 */

/** Longueur minimale d'une phrase secrète (NIST SP 800-63B recommande 8 minimum, 12+ conseillé). */
export const PASSPHRASE_MIN_LENGTH = 12

/**
 * Longueur maximale acceptée par l'interface. Le serveur pré-hache la phrase en
 * SHA-256 avant bcrypt : elle n'est donc jamais tronquée à 72 octets.
 */
export const PASSPHRASE_MAX_LENGTH = 256

export const EMAIL_MAX_LENGTH = 254
export const NAME_MAX_LENGTH = 80

/** Exemple volontairement fictif : il ne doit jamais être réutilisé comme secret. */
export const PASSPHRASE_EXAMPLE = 'givre cuillère renard violon'

export const PASSPHRASE_HINT =
  `Au moins ${PASSPHRASE_MIN_LENGTH} caractères, idéalement 4 à 5 mots sans lien entre eux. ` +
  'Les espaces sont acceptés.'

export const PASSPHRASE_EXAMPLE_NOTE =
  `Exemple fictif à ne pas réutiliser : « ${PASSPHRASE_EXAMPLE} ».`

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Adresse e-mail : obligatoire, sans espace, avec un domaine. */
export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (email.length === 0) return 'Indiquez votre adresse e-mail.'
  if (email.length > EMAIL_MAX_LENGTH) return 'Cette adresse e-mail est trop longue.'
  if (/\s/.test(email)) return 'Une adresse e-mail ne peut pas contenir d’espace.'
  if (!EMAIL_PATTERN.test(email)) return 'Saisissez une adresse e-mail valide, par exemple vous@exemple.com.'
  return null
}

/** Nom affiché : obligatoire, espaces superflus ignorés, longueur bornée. */
export function validateName(value: string): string | null {
  const name = value.trim()
  if (name.length === 0) return 'Indiquez votre nom.'
  if (name.length > NAME_MAX_LENGTH) return `Le nom ne peut pas dépasser ${NAME_MAX_LENGTH} caractères.`
  return null
}

/**
 * Nouvelle phrase secrète. Aucune composition arbitraire (majuscule, chiffre,
 * symbole) n'est imposée : la longueur prime. Les espaces et l'Unicode sont
 * conservés tels quels, sans `trim`, car ils font partie du secret.
 */
export function validatePassphrase(value: string): string | null {
  if (value.length === 0 || value.trim().length === 0) return 'Choisissez une phrase secrète.'
  if (value.length < PASSPHRASE_MIN_LENGTH) {
    return `Utilisez au moins ${PASSPHRASE_MIN_LENGTH} caractères : une phrase de 4 à 5 mots est plus facile à retenir.`
  }
  if (value.length > PASSPHRASE_MAX_LENGTH) {
    return `La phrase secrète ne peut pas dépasser ${PASSPHRASE_MAX_LENGTH} caractères.`
  }
  return null
}

/**
 * Phrase secrète à la connexion : seule la présence est exigée côté client.
 * Les comptes créés avant la politique actuelle (8 caractères) doivent pouvoir
 * continuer à se connecter ; Better Auth applique sa propre vérification.
 */
export function validateLoginPassword(value: string): string | null {
  if (value.length === 0) return 'Saisissez votre phrase secrète.'
  if (value.length > PASSPHRASE_MAX_LENGTH) {
    return `La phrase secrète ne peut pas dépasser ${PASSPHRASE_MAX_LENGTH} caractères.`
  }
  return null
}

/** Confirmation : obligatoire et strictement identique (espaces et Unicode compris). */
export function validatePassphraseConfirmation(value: string, confirmation: string): string | null {
  if (confirmation.length === 0) return 'Confirmez la phrase secrète.'
  if (value !== confirmation) return 'Les deux phrases secrètes ne correspondent pas.'
  return null
}
