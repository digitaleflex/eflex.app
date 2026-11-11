/**
 * Drapeau du déploiement multi-applications (lot C de D2, #6).
 *
 * `EFLEX_MULTI_APP=1` (ou `true`) autorise un projet à regrouper plusieurs
 * applications du même dépôt. Désactivé par défaut : la création refuse alors
 * plus d'une application et le parcours reste strictement mono-application.
 * Le drapeau est lu **côté serveur uniquement** : l'interface l'apprend par
 * `/api/auth/config`.
 */
export const MAX_PROJECT_APPS = 10

export const MULTI_APP_DISABLED_MESSAGE =
  'Le déploiement de plusieurs applications par projet est désactivé sur cette instance. ' +
  'Créez un projet par application.'

export const MULTI_APP_LIMIT_MESSAGE = `Un projet est limité à ${MAX_PROJECT_APPS} applications.`

/** Vrai si le drapeau est actif ; toute autre valeur (absente, `0`, `false`) le désactive. */
export function multiAppEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.EFLEX_MULTI_APP?.trim().toLowerCase()
  return raw === '1' || raw === 'true'
}
