import { describe, expect, it } from 'vitest'

import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSPHRASE_MAX_LENGTH,
  PASSPHRASE_MIN_LENGTH,
  validateEmail,
  validateLoginPassword,
  validateName,
  validatePassphrase,
  validatePassphraseConfirmation,
} from '@/lib/auth-validation'

describe('validateEmail', () => {
  it('accepte une adresse simple, y compris les espaces autour', () => {
    expect(validateEmail('vous@exemple.com')).toBeNull()
    expect(validateEmail('  vous@exemple.com  ')).toBeNull()
    expect(validateEmail('prénom+tag@sous.domaine.fr')).toBeNull()
    expect(validateEmail('utilisateur@exemple.photography')).toBeNull()
  })

  it('refuse une adresse vide ou incomplète', () => {
    expect(validateEmail('')).toMatch(/adresse e-mail/)
    expect(validateEmail('   ')).toMatch(/adresse e-mail/)
    expect(validateEmail('vous')).toMatch(/valide/)
    expect(validateEmail('vous@')).toMatch(/valide/)
    expect(validateEmail('vous@exemple')).toMatch(/valide/)
  })

  it('refuse les espaces internes et les adresses trop longues', () => {
    expect(validateEmail('vous @exemple.com')).toMatch(/espace/)
    expect(validateEmail(`${'a'.repeat(EMAIL_MAX_LENGTH)}@exemple.com`)).toMatch(/trop longue/)
  })
})

describe('validateName', () => {
  it('exige un nom non vide', () => {
    expect(validateName('')).toMatch(/nom/)
    expect(validateName('   ')).toMatch(/nom/)
    expect(validateName('Ada Lovelace')).toBeNull()
  })

  it('borne la longueur', () => {
    expect(validateName('a'.repeat(NAME_MAX_LENGTH))).toBeNull()
    expect(validateName('a'.repeat(NAME_MAX_LENGTH + 1))).toMatch(/dépasser/)
  })
})

describe('validatePassphrase', () => {
  it('refuse une valeur vide ou uniquement composée d’espaces', () => {
    expect(validatePassphrase('')).toMatch(/phrase secrète/)
    expect(validatePassphrase('     ')).toMatch(/phrase secrète/)
  })

  it('accepte exactement la longueur minimale, sans composition imposée', () => {
    expect(validatePassphrase('a'.repeat(PASSPHRASE_MIN_LENGTH - 1))).toMatch(/au moins/)
    expect(validatePassphrase('a'.repeat(PASSPHRASE_MIN_LENGTH))).toBeNull()
  })

  it('accepte les espaces et les phrases longues', () => {
    expect(validatePassphrase('givre cuillère renard violon')).toBeNull()
    expect(validatePassphrase('  givre cuillère renard violon  ')).toBeNull()
    expect(validatePassphrase('a'.repeat(PASSPHRASE_MAX_LENGTH))).toBeNull()
  })

  it('refuse au-delà de la limite maximale', () => {
    expect(validatePassphrase('a'.repeat(PASSPHRASE_MAX_LENGTH + 1))).toMatch(/dépasser/)
  })

  it('accepte l’Unicode et ne tronque rien', () => {
    expect(validatePassphrase('éééééééééééé')).toBeNull()
    expect(validatePassphrase('🔐🚀🌍🔥🛡️🧭🔑📦')).toBeNull()
  })
})

describe('validateLoginPassword', () => {
  it('n’impose pas la nouvelle longueur minimale aux comptes existants', () => {
    expect(validateLoginPassword('motdepasse')).toBeNull()
    expect(validateLoginPassword('')).toMatch(/phrase secrète/)
    expect(validateLoginPassword('a'.repeat(PASSPHRASE_MAX_LENGTH + 1))).toMatch(/dépasser/)
  })
})

describe('validatePassphraseConfirmation', () => {
  it('exige une confirmation', () => {
    expect(validatePassphraseConfirmation('givre cuillère renard violon', '')).toMatch(/Confirmez/)
  })

  it('compare strictement, espaces et Unicode compris', () => {
    expect(validatePassphraseConfirmation('givre cuillère renard violon', 'givre cuillère renard violon')).toBeNull()
    expect(validatePassphraseConfirmation('givre cuillère renard violon', 'givre cuillère renard violon ')).toMatch(/correspondent pas/)
    expect(validatePassphraseConfirmation('secret', 'sécret')).toMatch(/correspondent pas/)
  })
})
