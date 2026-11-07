'use client'

import { createAuthClient } from 'better-auth/react'

// Sans baseURL, le client appelle /api/auth sur l'origine courante.
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Email ou mot de passe incorrect.',
  INVALID_EMAIL: 'Adresse e-mail invalide.',
  USER_ALREADY_EXISTS: 'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez une autre adresse.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez une autre adresse.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 8 caractères.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long (72 caractères maximum).',
  EMAIL_NOT_VERIFIED: 'Vérifiez votre adresse e-mail avant de vous connecter.',
  PROVIDER_NOT_FOUND: "Cette méthode de connexion n'est pas disponible pour le moment.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: 'Ce compte Google est déjà associé à un autre compte Eflex.',
}

/** Traduit une erreur Better Auth en message français affichable. */
export function authErrorMessage(
  error: { code?: string; status?: number; message?: string } | null | undefined,
  fallback = 'Une erreur est survenue. Réessayez dans un instant.',
): string {
  if (!error) return fallback
  if (error.status === 429) return 'Trop de tentatives. Patientez quelques instants avant de réessayer.'
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]
  return fallback
}
