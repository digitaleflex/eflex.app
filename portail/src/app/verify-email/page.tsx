'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { AuthLayout } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { useAuthConfig } from '@/components/auth/use-auth-config'
import { useValidatedField } from '@/components/auth/use-validated-field'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { validateEmail } from '@/lib/auth-validation'
import { safeNext, withNext } from '@/lib/safe-next'

/** Délai de renvoi côté interface ; le serveur applique aussi sa propre limite. */
const RESEND_DELAY_SECONDS = 60

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      title="Vérifiez votre adresse e-mail"
      description="Un lien de vérification vous a été envoyé. Cliquez dessus pour activer votre compte, puis connectez-vous."
      footer={
        <>
          Déjà vérifié ?{' '}
          <Link suppressHydrationWarning href={withNext('/login')} className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <Suspense
        fallback={
          <Card className="p-6">
            <p role="status" className="text-sm text-muted-foreground">
              Chargement du formulaire…
            </p>
          </Card>
        }
      >
        <VerifyEmailForm />
      </Suspense>
    </AuthLayout>
  )
}

function VerifyEmailForm() {
  const params = useSearchParams()
  const router = useRouter()
  const { config } = useAuthConfig()

  const email = useValidatedField(params.get('email') ?? '', validateEmail)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const callbackURL = safeNext(params.get('next'))

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current || cooldown > 0) return
    setMessage('')
    setFormError('')

    const emailError = email.showError()
    if (emailError) {
      emailRef.current?.focus()
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      const { error: authError } = await authClient.sendVerificationEmail({
        email: email.value.trim(),
        callbackURL,
      })
      if (authError) {
        setFormError(authErrorMessage(authError, 'Impossible de renvoyer l’e-mail. Réessayez dans un instant.'))
        requestAnimationFrame(() => alertRef.current?.focus())
        return
      }
      setMessage('Un nouvel e-mail de vérification a été envoyé. Pensez à vérifier vos courriers indésirables.')
      setCooldown(RESEND_DELAY_SECONDS)
    } catch {
      setFormError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
      requestAnimationFrame(() => alertRef.current?.focus())
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  if (config?.emailVerificationRequired === false) {
    return (
      <Card className="space-y-4 p-6">
        <div role="status" className="space-y-2 text-sm">
          <p className="text-foreground">La vérification par e-mail n’est pas requise sur cette instance.</p>
          <p className="text-muted-foreground">Vous pouvez vous connecter directement avec votre adresse e-mail.</p>
        </div>
        <Button size="lg" className="w-full" onClick={() => router.push(withNext('/login'))}>
          Aller à la connexion
        </Button>
      </Card>
    )
  }

  return (
    <Card className="space-y-5 p-6">
      {message && <FormAlert tone="success">{message}</FormAlert>}
      {formError && (
        <FormAlert ref={alertRef} id="verify-email-error">
          {formError}
        </FormAlert>
      )}

      <form onSubmit={handleResend} className="space-y-4" noValidate>
        <Input
          ref={emailRef}
          id="verify-email"
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="vous@exemple.com"
          value={email.value}
          onChange={(event) => email.change(event.target.value)}
          onBlur={email.blur}
          error={email.error ?? undefined}
          hint="Utilisez l’adresse du compte à vérifier."
          disabled={loading}
          required
        />

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={cooldown > 0}>
          {cooldown > 0 ? `Renvoyer dans ${cooldown} s` : 'Renvoyer l’e-mail'}
        </Button>
      </form>
    </Card>
  )
}
