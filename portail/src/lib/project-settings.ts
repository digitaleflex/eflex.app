/**
 * Validation des réglages projet et des variables d'environnement.
 *
 * Ces schémas sont partagés par les routes API et testés directement : le
 * client ne décide jamais du format d'un nom, d'une branche ou d'une clé.
 */
import { z } from 'zod'

export const PROJECT_NAME_MAX = 60
export const BRANCH_MAX = 120
export const ENV_KEY_MAX = 100
export const ENV_VALUE_MAX = 5_000

/** Sous-ensemble sûr des noms de branches Git (pas d'espaces ni de caractères de contrôle). */
export const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export const projectUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Le nom du projet ne peut pas être vide.')
      .max(PROJECT_NAME_MAX, `Le nom du projet est trop long (${PROJECT_NAME_MAX} caractères maximum).`)
      .optional(),
    branch: z
      .string()
      .trim()
      .min(1, 'La branche ne peut pas être vide.')
      .max(BRANCH_MAX, `Le nom de branche est trop long (${BRANCH_MAX} caractères maximum).`)
      .regex(BRANCH_PATTERN, 'Nom de branche invalide : lettres, chiffres, « . », « _ », « / » et « - ».')
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.branch !== undefined, {
    message: 'Aucune modification fournie.',
  })

export const envVarSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Le nom de la variable ne peut pas être vide.')
    .max(ENV_KEY_MAX, `Le nom de la variable est trop long (${ENV_KEY_MAX} caractères maximum).`)
    .regex(
      ENV_KEY_PATTERN,
      'Nom de variable invalide : lettres, chiffres et « _ », sans commencer par un chiffre.',
    ),
  value: z
    .string()
    .max(ENV_VALUE_MAX, `La valeur est trop longue (${ENV_VALUE_MAX} caractères maximum).`),
  appId: z.string().trim().min(1, "L'application est invalide.").optional(),
})

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
export type EnvVarInput = z.infer<typeof envVarSchema>

/** Premier message d'erreur lisible d'un échec de validation Zod. */
export function firstIssue(error: z.ZodError, fallback = 'Données invalides.'): string {
  return error.issues[0]?.message ?? fallback
}
