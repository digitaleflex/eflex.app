'use client'

import { nextFromLocation, withNext } from '@/lib/safe-next'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { AuthDivider, AuthLayout } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { GoogleButton } from '@/components/auth/google-button'
import { PassphraseField, PassphraseGuidance } from '@/components/auth/passphrase-field'
import { useAuthConfig, useOAuthError } from '@/components/auth/use-auth-config'
import { useValidatedField } from '@/components/auth/use-validated-field'
import { CAPTCHA_ENABLED, Turnstile, captchaHeaders } from '@/components/auth/turnstile'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authErrorMessage, signUp } from '@/lib/auth-client'
import {
  validateEmail,
  validateName,
  validatePassphrase,
  validatePassphraseConfirmation,
} from '@/lib/auth-validation'

function focusFirst(
  errors: (string | null)[],
  refs: React.RefObject<HTMLInputElement | null>[],
) {
  const index = errors.findIndex(Boolean)
  if (index >= 0) refs[index]?.current?.focus()
}

export default function RegisterPage() {
  const router = useRouter()
  const { config } = useAuthConfig()
  const oauthError = useOAuthError()

  const name = useValidatedField('', validateName)
  const email = useValidatedField('', validateEmail)
  const passphrase = useValidatedField('', validatePassphrase)
  const confirmation = useValidatedField('', (value) =>
    validatePassphraseConfirmation(passphrase.value, value),
  )

  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passphraseRef = useRef<HTMLInputElement>(null)
  const confirmationRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (oauthError) setFormError(oauthError)
  }, [oauthError])

  const focusAlert = () => {
    requestAnimationFrame(() => alertRef.current?.focus())
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    setFormError('')

    const errors = [
      name.showError(),
      email.showError(),
      passphrase.showError(),
      confirmation.showError(),
    ]
    if (errors.some(Boolean)) {
      focusFirst(errors, [nameRef, emailRef, passphraseRef, confirmationRef])
      return
    }

    if (CAPTCHA_ENABLED && !captchaToken) {
      setFormError('Complétez la vérification anti-robot avant de continuer.')
      focusAlert()
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      const { data, error: authError } = await signUp.email(
        {
          name: name.value.trim(),
          email: email.value.trim(),
          password: passphrase.value,
        },
        captchaHeaders(captchaToken),
      )

      if (authError) {
        setFormError(authErrorMessage(authError, 'Impossible de créer le compte. Réessayez dans un instant.'))
        focusAlert()
        return
      }

      // Avec la vérification d'e-mail active, Better Auth ne crée pas de
      // session (`token` nul) : on affiche l'étape de vérification. Sinon on
      // rejoint directement la destination demandée.
      const token = (data as { token?: string | null } | null)?.token
      const verificationRequired = token == null || config?.emailVerificationRequired === true
      if (verificationRequired) {
        const params = new URLSearchParams({ email: email.value.trim() })
        const next = new URLSearchParams(window.location.search).get('next')
        if (next) params.set('next', nextFromLocation())
        router.push(`/verify-email?${params.toString()}`)
        return
      }

      router.push(nextFromLocation())
      router.refresh()
    } catch {
      setFormError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
      focusAlert()
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <AuthLayout
      title="Créer un compte"
      description="Déployez votre premier projet en quelques minutes."
      footer={
        <>
          Déjà un compte ?{' '}
          <Link suppressHydrationWarning href={withNext('/login')} className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <Card className="space-y-6 p-6">
        {config?.googleEnabled && (
          <>
            <GoogleButton disabled={loading} onError={(message) => {
              setFormError(message)
              focusAlert()
            }} />
            <AuthDivider />
          </>
        )}

        {formError && (
          <FormAlert ref={alertRef} id="register-error">
            {formError}
          </FormAlert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            ref={nameRef}
            id="name"
            label="Nom"
            autoComplete="name"
            value={name.value}
            onChange={(event) => name.change(event.target.value)}
            onBlur={name.blur}
            error={name.error ?? undefined}
            disabled={loading}
            required
          />

          <Input
            ref={emailRef}
            id="email"
            label="Adresse e-mail"
            type="email"
            placeholder="vous@exemple.com"
            autoComplete="email"
            inputMode="email"
            value={email.value}
            onChange={(event) => email.change(event.target.value)}
            onBlur={email.blur}
            error={email.error ?? undefined}
            disabled={loading}
            required
          />

          <PassphraseField
            ref={passphraseRef}
            id="password"
            label="Phrase secrète (mot de passe)"
            autoComplete="new-password"
            value={passphrase.value}
            onChange={passphrase.change}
            onBlur={passphrase.blur}
            error={passphrase.error}
            disabled={loading}
            required
          />

          <PassphraseField
            ref={confirmationRef}
            id="confirm-password"
            label="Confirmer la phrase secrète"
            autoComplete="new-password"
            value={confirmation.value}
            onChange={confirmation.change}
            onBlur={confirmation.blur}
            error={confirmation.error}
            hint="Saisissez à nouveau la même phrase, espaces compris."
            disabled={loading}
            required
          />

          <PassphraseGuidance />

          <p className="text-xs text-muted-foreground">
            En créant un compte, vous reconnaissez avoir pris connaissance des{' '}
            <Link href="/conditions" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
              conditions d’utilisation
            </Link>{' '}
            et de la{' '}
            <Link href="/confidentialite" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
              politique de confidentialité
            </Link>
            .
          </p>

          {CAPTCHA_ENABLED && <Turnstile onToken={setCaptchaToken} />}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Créer mon compte
          </Button>
        </form>
      </Card>
    </AuthLayout>
  )
}
