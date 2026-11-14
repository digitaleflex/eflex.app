'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { FormAlert } from '@/components/auth/form-alert'
import { CAPTCHA_ENABLED, Turnstile, captchaHeaders } from '@/components/auth/turnstile'
import { useValidatedField } from '@/components/auth/use-validated-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import { validateEmail } from '@/lib/auth-validation'

/** Délai avant de pouvoir demander un nouveau code (le serveur limite aussi les envois). */
const RESEND_DELAY_SECONDS = 60

/**
 * Connexion et inscription sans mot de passe : une adresse e-mail, puis un code à 6 chiffres reçu par
 * e-mail. Un compte est créé au premier code valide (nom tiré de l'adresse, modifiable ensuite).
 *
 * Réel de bout en bout : l'envoi et la vérification passent par le plugin `emailOTP` de Better Auth.
 * Avec le captcha activé, un nouveau code se demande depuis l'étape de l'adresse (le jeton Turnstile
 * ne sert qu'une fois).
 */
export function EmailCodeForm({
  initialEmail = '',
  onSuccess,
  onUsePassword,
  onStepChange,
  disabled,
}: {
  initialEmail?: string
  onSuccess: () => void
  /** Bascule vers le mot de passe, avec l'adresse déjà saisie. */
  onUsePassword?: (email: string) => void
  /** Permet à la page de masquer les autres méthodes pendant la saisie du code. */
  onStepChange?: (step: 'email' | 'code') => void
  disabled?: boolean
}) {
  const email = useValidatedField(initialEmail, validateEmail)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const onStepChangeRef = useRef(onStepChange)
  onStepChangeRef.current = onStepChange

  useEffect(() => {
    onStepChangeRef.current?.(step)
    // Si le formulaire disparaît (changement de mode), la page retrouve toutes ses méthodes.
    return () => onStepChangeRef.current?.('email')
  }, [step])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  const showError = (message: string) => {
    setError(message)
    requestAnimationFrame(() => alertRef.current?.focus())
  }

  const sendCode = async () => {
    if (busyRef.current) return
    setError('')
    if (email.showError()) {
      emailRef.current?.focus()
      return
    }
    if (CAPTCHA_ENABLED && !captchaToken) {
      showError('Complétez la vérification anti-robot avant de continuer.')
      return
    }
    busyRef.current = true
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp(
        { email: email.value.trim(), type: 'sign-in' },
        captchaHeaders(captchaToken),
      )
      if (result.error) {
        showError(authErrorMessage(result.error, 'Impossible d’envoyer le code. Réessayez dans un instant.'))
        return
      }
      setCode('')
      setStep('code')
      setSecondsLeft(RESEND_DELAY_SECONDS)
      requestAnimationFrame(() => codeRef.current?.focus())
    } catch {
      showError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }

  const verify = async (value: string) => {
    if (busyRef.current) return
    if (!/^\d{6}$/.test(value)) {
      showError('Le code contient 6 chiffres.')
      codeRef.current?.focus()
      return
    }
    setError('')
    busyRef.current = true
    setLoading(true)
    try {
      const result = await authClient.signIn.emailOtp({ email: email.value.trim(), otp: value })
      if (result.error) {
        showError(authErrorMessage(result.error, 'Code incorrect. Vérifiez-le ou demandez-en un nouveau.'))
        setCode('')
        codeRef.current?.focus()
        return
      }
      onSuccess()
    } catch {
      showError('Impossible de contacter le serveur. Réessayez.')
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }

  if (step === 'code') {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void verify(code)
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setError('')
            }}
            className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Changer d’adresse
          </button>
          <h2 className="text-lg font-semibold">Vérifiez vos e-mails</h2>
          <p className="text-sm text-muted-foreground">
            Nous avons envoyé un code à 6 chiffres à{' '}
            <strong className="break-words font-semibold text-foreground">{email.value.trim()}</strong>. Il expire dans
            10 minutes.
          </p>
        </div>

        {error && (
          <FormAlert ref={alertRef} id="email-code-error">
            {error}
          </FormAlert>
        )}

        <Input
          ref={codeRef}
          id="email-code"
          label="Code reçu"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          className="h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums"
          value={code}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, '').slice(0, 6)
            setCode(next)
            // Le sixième chiffre valide tout seul : un code collé ou rempli par le clavier n'attend pas un clic.
            if (next.length === 6) void verify(next)
          }}
          disabled={loading || disabled}
          required
        />

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={disabled}>
          Continuer
        </Button>

        <p className="text-center text-sm text-muted-foreground" aria-live="polite">
          {secondsLeft > 0 ? (
            <>Rien reçu ? Nouveau code possible dans {secondsLeft}&nbsp;s.</>
          ) : (
            <>
              Rien reçu ?{' '}
              <button
                type="button"
                onClick={() => {
                  // Avec le captcha, il faut un jeton neuf : on repasse par l'étape de l'adresse.
                  if (CAPTCHA_ENABLED) {
                    setCaptchaToken(null)
                    setStep('email')
                  } else void sendCode()
                }}
                className="min-h-11 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={loading}
              >
                Renvoyer le code
              </button>
            </>
          )}
        </p>
      </form>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void sendCode()
      }}
      className="space-y-4"
      noValidate
    >
      {error && (
        <FormAlert ref={alertRef} id="email-code-error">
          {error}
        </FormAlert>
      )}

      <Input
        ref={emailRef}
        id="email-code-address"
        label="Adresse e-mail"
        type="email"
        placeholder="vous@exemple.com"
        autoComplete="email"
        inputMode="email"
        value={email.value}
        onChange={(event) => email.change(event.target.value)}
        onBlur={email.blur}
        error={email.error ?? undefined}
        disabled={loading || disabled}
        required
      />

      {CAPTCHA_ENABLED && <Turnstile onToken={setCaptchaToken} />}

      <Button type="submit" size="lg" className="w-full" loading={loading} disabled={disabled}>
        Recevoir un code
      </Button>

      {onUsePassword && (
        <p className="text-center text-sm">
          <button
            type="button"
            onClick={() => onUsePassword(email.value.trim())}
            className="min-h-11 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Utiliser un mot de passe
          </button>
        </p>
      )}
    </form>
  )
}
