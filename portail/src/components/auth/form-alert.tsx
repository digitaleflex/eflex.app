'use client'

import { forwardRef, type ReactNode } from 'react'

export type FormAlertTone = 'error' | 'success' | 'info'

const TONES: Record<FormAlertTone, string> = {
  error: 'border-destructive/25 bg-destructive/10 text-destructive',
  success: 'border-success/25 bg-success/10 text-foreground',
  info: 'border-border bg-muted/50 text-foreground',
}

/**
 * Message de formulaire annoncé par les lecteurs d'écran : `alert` pour une
 * erreur, `status` pour un succès ou une information. Le conteneur peut
 * recevoir le focus après une soumission pour que l'erreur soit lue et que la
 * suite du parcours clavier reprenne au bon endroit.
 */
export const FormAlert = forwardRef<HTMLDivElement, {
  tone?: FormAlertTone
  children: ReactNode
  id?: string
  className?: string
}>(function FormAlert({ tone = 'error', children, id, className }, ref) {
  const isError = tone === 'error'
  return (
    <div
      ref={ref}
      id={id}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      tabIndex={-1}
      className={[
        'rounded-lg border p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
})
