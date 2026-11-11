'use client'

import { useCallback, useState } from 'react'

export interface ValidatedField {
  value: string
  error: string | null
  touched: boolean
  /** Met à jour la valeur ; réévalue seulement après un blur ou une première erreur. */
  change: (next: string) => void
  /** Valide au blur (première interaction), puis à chaque saisie. */
  blur: () => void
  /** Force la validation (soumission) et renvoie le message éventuel. */
  showError: () => string | null
  /** Réinitialise valeur et état (après succès ou changement de mode). */
  reset: (next?: string) => void
}

/**
 * État d'un champ : pas d'erreur avant la première interaction, puis validation
 * à la saisie. `showError` est appelé à la soumission pour afficher toutes les
 * erreurs et focaliser le premier champ invalide.
 */
export function useValidatedField(
  initial: string,
  validate: (value: string) => string | null,
): ValidatedField {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const change = useCallback(
    (next: string) => {
      setValue(next)
      setError((current) => (touched || current ? validate(next) : current))
    },
    [touched, validate],
  )

  const blur = useCallback(() => {
    setTouched(true)
    setError(validate(value))
  }, [validate, value])

  const showError = useCallback(() => {
    setTouched(true)
    const message = validate(value)
    setError(message)
    return message
  }, [validate, value])

  const reset = useCallback((next = '') => {
    setValue(next)
    setError(null)
    setTouched(false)
  }, [])

  return { value, error, touched, change, blur, showError, reset }
}
