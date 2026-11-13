'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { AuthLayout } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { useAuthConfig } from '@/components/auth/use-auth-config'
import { useValidatedField } from '@/components/auth/use-validated-field'
import { CAPTCHA_ENABLED, Turnstile, captchaHeaders } from '@/components/auth/turnstile'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { validateEmail } from '@/lib/auth-validation'
import { withNext } from '@/lib/safe-next'

export default function ForgotPasswordPage() {
  const { config } = useAuthConfig()
  const email = useValidatedField('', validateEmail)

  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (formError) requestAnimationFrame(() => alertRef.current?.focus())
  }, [formError])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    setFormError('')

    const emailError = email.showError()
    if (emailError) {
      emailRef.current?.focus()
      return
    }

    if (CAPTCHA_ENABLED && !captchaToken) {
      setFormError('Complétez la vérification anti-robot avant de continuer.')
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      const { error: authError } = await authClient.requestPasswordReset(
        { email: email.value.trim(), redirectTo: '/reset-password' },
        captchaHeaders(captchaToken),
      )
      if (authError) {
        setFormError(authErrorMessage(authError, 'Impossible d’envoyer le lien. Réessayez dans un instant.'))
        return
      }
      // Message identique quelle que soit l'existence du compte (anti-énumération).
      setSent(true)
      email.reset()
    } catch {
      setFormError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <AuthLayout
      title="Mot de passe oublié"
      description="Indiquez votre adresse e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe."
      footer={
        <Link suppressHydrationWarning href={withNext('/login')} className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <Card className="space-y-5 p-6">
        {config?.emailEnabled === false ? (
          <div role="status" className="space-y-3 text-sm">
            <p className="text-foreground">La réinitialisation par e-mail sera disponible prochainement.</p>
            <p className="text-muted-foreground">
              En attendant, contactez le support si vous ne pouvez plus accéder à votre compte.
            </p>
          </div>
        ) : sent ? (
          <div role="status" className="space-y-3 text-sm text-foreground">
            <p>Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé.</p>
            <p className="text-muted-foreground">Le lien est valable 1 heure et ne peut être utilisé qu’une fois.</p>
          </div>
        ) : (
          <>
            {formError && (
              <FormAlert ref={alertRef} id="forgot-password-error">
                {formError}
              </FormAlert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Input
                ref={emailRef}
                id="forgot-email"
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="vous@exemple.com"
                value={email.value}
                onChange={(event) => email.change(event.target.value)}
                onBlur={email.blur}
                error={email.error ?? undefined}
                disabled={loading}
                required
              />

              {CAPTCHA_ENABLED && <Turnstile onToken={setCaptchaToken} />}

              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Envoyer le lien
              </Button>
            </form>
          </>
        )}
      </Card>
    </AuthLayout>
  )
}
