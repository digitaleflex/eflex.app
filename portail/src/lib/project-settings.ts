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

const envKeySchema = z
  .string()
  .trim()
  .min(1, 'Le nom de la variable ne peut pas être vide.')
  .max(ENV_KEY_MAX, `Le nom de la variable est trop long (${ENV_KEY_MAX} caractères maximum).`)
  .regex(ENV_KEY_PATTERN, 'Nom de variable invalide : lettres, chiffres et « _ », sans commencer par un chiffre.')

const envValueSchema = z
  .string()
  .max(ENV_VALUE_MAX, `La valeur est trop longue (${ENV_VALUE_MAX} caractères maximum).`)

export const envVarSchema = z.object({
  key: envKeySchema,
  value: envValueSchema,
  appId: z.string().trim().min(1, "L'application est invalide.").optional(),
})

/** Nombre maximal de variables enregistrées en une fois (collage ou import d'un fichier .env). */
export const ENV_BULK_MAX = 200

/**
 * Enregistrement en lot : le même contrat que `envVarSchema`, pour plusieurs variables, avec un message
 * qui nomme la variable fautive. Les doublons ne sont pas une erreur : la dernière valeur est conservée.
 */
export const envBulkSchema = z.object({
  vars: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .min(1, 'Aucune variable à enregistrer.')
    .max(ENV_BULK_MAX, `Trop de variables d'un coup (${ENV_BULK_MAX} maximum).`)
    .transform((vars, ctx) => {
      const byKey = new Map<string, { key: string; value: string }>()
      vars.forEach((item, index) => {
        const key = envKeySchema.safeParse(item.key)
        const value = envValueSchema.safeParse(item.value)
        if (!key.success || !value.success) {
          const message = (!key.success ? key.error : value.error!).issues[0]?.message ?? 'Variable invalide.'
          ctx.addIssue({
            code: 'custom',
            message: `Variable ${index + 1}${item.key.trim() ? ` (${item.key.trim().slice(0, 40)})` : ''} : ${message}`,
          })
          return
        }
        byKey.delete(key.data)
        byKey.set(key.data, { key: key.data, value: item.value })
      })
      return [...byKey.values()]
    }),
  appId: z.string().trim().min(1, "L'application est invalide.").optional(),
})

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
export type EnvVarInput = z.infer<typeof envVarSchema>
export type EnvBulkInput = z.infer<typeof envBulkSchema>

/** Premier message d'erreur lisible d'un échec de validation Zod. */
export function firstIssue(error: z.ZodError, fallback = 'Données invalides.'): string {
  return error.issues[0]?.message ?? fallback
}
