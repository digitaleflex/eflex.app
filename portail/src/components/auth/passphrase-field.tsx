'use client'

import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { PASSPHRASE_EXAMPLE_NOTE, PASSPHRASE_HINT } from '@/lib/auth-validation'

export interface PassphraseFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  autoComplete: 'current-password' | 'new-password'
  error?: string | null
  hint?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
}

/**
 * Champ de mot de passe avec affichage/masquage. Le libellé visible reste
 * « Mot de passe » ; les conseils recommandent une phrase de plusieurs mots.
 * Le bouton n'emploie pas « mot de passe » dans son nom accessible pour ne pas
 * rendre ambigu un sélecteur par libellé (`getByLabel('Mot de passe')`).
 */
export const PassphraseField = forwardRef<HTMLInputElement, PassphraseFieldProps>(
  function PassphraseField(
    {
      id,
      label,
      value,
      onChange,
      onBlur,
      autoComplete,
      error,
      hint = PASSPHRASE_HINT,
      disabled,
      required,
      autoFocus,
    },
    ref,
  ) {
    const [visible, setVisible] = useState(false)

    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            autoComplete={autoComplete}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            error={error ?? undefined}
            hint={hint}
            disabled={disabled}
            required={required}
            autoFocus={autoFocus}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-pressed={visible}
            aria-controls={id}
            aria-label={visible ? 'Masquer les caractères' : 'Afficher les caractères'}
            title={visible ? 'Masquer les caractères' : 'Afficher les caractères'}
            disabled={disabled}
            className="absolute right-0 top-0 z-10 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 ease-out-expo hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    )
  },
)

/** Conseils de création, utiles même sans JavaScript (élément `details` natif). */
export function PassphraseGuidance({ className }: { className?: string }) {
  return (
    <details className={['rounded-lg border border-border bg-muted/40 px-3 text-sm', className].filter(Boolean).join(' ')}>
      <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        Comment choisir un bon mot de passe ?
      </summary>
      <ul className="list-disc space-y-1 pb-3 pl-5 text-muted-foreground">
        <li>4 à 5 mots sans lien entre eux, séparés par des espaces.</li>
        <li>Au moins 12 caractères : une phrase longue est acceptée et jamais tronquée.</li>
        <li>Évitez votre nom, une date, une citation connue ou une information personnelle.</li>
        <li>N’utilisez jamais le même secret sur plusieurs sites.</li>
        <li>{PASSPHRASE_EXAMPLE_NOTE}</li>
      </ul>
    </details>
  )
}
