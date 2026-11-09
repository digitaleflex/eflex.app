'use client'

import { createAuthClient } from 'better-auth/react'
import { adminClient, organizationClient } from 'better-auth/client/plugins'

// Sans baseURL, le client appelle /api/auth sur l'origine courante.
export const authClient = createAuthClient({ plugins: [organizationClient(), adminClient()] })

// `authClient` reste exporté pour les méthodes de vérification et de reset.
export const { signIn, signUp, signOut, useSession } = authClient

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Email ou mot de passe incorrect.',
  INVALID_EMAIL: 'Adresse e-mail invalide.',
  USER_ALREADY_EXISTS: 'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez une autre adresse.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez une autre adresse.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 8 caractères.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long (72 caractères maximum).',
  INVALID_PASSWORD: 'Mot de passe incorrect.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Ce compte n'a pas de mot de passe (connexion Google).",
  SESSION_EXPIRED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  CHANGE_EMAIL_DISABLED: "Le changement d'adresse e-mail n'est pas disponible.",
  EMAIL_IS_THE_SAME: 'Cette adresse est déjà celle de votre compte.',
  PROVIDER_NOT_FOUND: "Cette méthode de connexion n'est pas disponible pour le moment.",
  ORGANIZATION_HAS_PROJECTS: "Supprimez d'abord les projets de l'organisation : leurs applications doivent être retirées du serveur.",
  ACCOUNT_HAS_DEPLOYED_PROJECTS: "Supprimez d'abord vos projets déployés : leurs applications doivent être retirées du serveur.",
  ORGANIZATION_SLUG_ALREADY_TAKEN: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.',
  ORGANIZATION_ALREADY_EXISTS: 'Une organisation porte déjà ce nom.',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS: "Vous avez atteint le nombre maximal d'organisations.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'Cette personne fait déjà partie de l\'organisation.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'Cette personne a déjà été invitée.',
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "Votre rôle ne permet pas d'inviter des membres.",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE: "Votre rôle ne permet pas d'attribuer ce rôle.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: 'Votre rôle ne permet pas de modifier ce membre.',
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: 'Votre rôle ne permet pas de retirer ce membre.',
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "Votre rôle ne permet pas de modifier l'organisation.",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION: "Seul un propriétaire peut supprimer l'organisation.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "Vous êtes le seul propriétaire : désignez un autre propriétaire avant de quitter l'organisation.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "Désignez un autre propriétaire avant de quitter l'organisation.",
  INVITATION_NOT_FOUND: 'Cette invitation est introuvable, expirée ou déjà utilisée.',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec l'adresse invitée.",
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
