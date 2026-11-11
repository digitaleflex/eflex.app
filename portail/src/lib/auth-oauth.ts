/**
 * Messages et URLs du retour OAuth Google (issue #57).
 *
 * Le fournisseur peut refuser la connexion (annulation) ou échouer après le
 * callback. On ne relaie jamais `error_description` : le message affiché reste
 * générique pour ne pas exposer de détails sensibles.
 */

import { safeNext } from '@/lib/safe-next'

/**
 * Validation serveur d'une destination OAuth : seuls les chemins internes sont
 * acceptés, tout le reste retombe sur `fallback`. Renvoie `null` si la valeur
 * n'est pas une chaîne (paramètre absent).
 */
export function sanitizeOAuthRedirect(value: unknown, fallback = '/dashboard'): string | null {
  return typeof value === 'string' ? safeNext(value, fallback) : null
}

/** Message à afficher après un retour OAuth en erreur, ou `null` hors de ce cas. */
export function oauthErrorMessage(params: URLSearchParams): string | null {
  if (params.get('oauth') !== 'error') return null
  const error = params.get('error')
  if (!error) return 'La connexion avec Google a échoué. Réessayez dans un instant.'
  if (error === 'access_denied') return 'Connexion avec Google annulée.'
  if (error === 'signup_disabled') return 'La création de compte avec Google est désactivée. Utilisez votre adresse e-mail.'
  if (error === 'account_not_linked') return 'Ce compte Google n’est pas associé à un compte Eflex.'
  return 'La connexion avec Google a échoué. Réessayez ou utilisez votre adresse e-mail.'
}

/**
 * URL de retour en cas d'échec OAuth, sur la page courante, en conservant la
 * destination `next` déjà validée par `safeNext`.
 */
export function oauthErrorCallbackURL(pathname: string, next: string): string {
  const params = new URLSearchParams({ oauth: 'error', next })
  return `${pathname}?${params.toString()}`
}
