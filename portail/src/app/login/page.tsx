'use client'

import { nextFromLocation, withNext } from '@/lib/safe-next'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Fingerprint, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { AuthDivider, AuthLayout } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { EmailCodeForm } from '@/components/auth/email-code-form'
import { OAuthButton } from '@/components/auth/oauth-buttons'
import { PassphraseField } from '@/components/auth/passphrase-field'
import { useAuthConfig, useOAuthError } from '@/components/auth/use-auth-config'
import { useValidatedField } from '@/components/auth/use-validated-field'
import { CAPTCHA_ENABLED, Turnstile, captchaHeaders } from '@/components/auth/turnstile'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage, signIn } from '@/lib/auth-client'
import { validateEmail, validateLoginPassword } from '@/lib/auth-validation'

const LOGIN_PASSPHRASE_HINT = 'Espaces acceptés. Votre gestionnaire de mots de passe peut le remplir.'

function focusFirst(
  errors: (string | null)[],
  refs: React.RefObject<HTMLInputElement | null>[],
) {
  const index = errors.findIndex(Boolean)
  if (index >= 0) refs[index]?.current?.focus()
}

/** Ajoute `email` à un lien qui peut déjà porter `?next=`. */
function verifyEmailHref(email: string): string {
  const base = withNext('/verify-email')
  return `${base}${base.includes('?') ? '&' : '?'}email=${encodeURIComponent(email.trim())}`
}

export default function LoginPage() {
  const router = useRouter()
  const { config, failed: configFailed } = useAuthConfig()
  const oauthError = useOAuthError()

  const email = useValidatedField('', validateEmail)
  const passphrase = useValidatedField('', validateLoginPassword)

  const [formError, setFormError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [loading, setLoading] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [mode, setMode] = useState<'code' | 'password'>('code')
  const [codeStep, setCodeStep] = useState<'email' | 'code'>('email')
  const [lastMethod, setLastMethod] = useState<string | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)
  const passphraseRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('two-factor') === '1') {
      setTwoFactor(true)
    }
    setPasskeySupported(typeof window !== 'undefined' && 'PublicKeyCredential' in window)
    // Dernière méthode utilisée (cookie posé par le plugin `lastLoginMethod`) : simple repère visuel.
    setLastMethod(authClient.getLastUsedLoginMethod())
  }, [])

  useEffect(() => {
    if (oauthError) setFormError(oauthError)
  }, [oauthError])

  const configReady = config !== null || configFailed
  const codeEnabled = config?.emailCodeEnabled === true
  const showCode = codeEnabled && mode === 'code'
  const anyPasswordless = Boolean(config?.githubEnabled || config?.googleEnabled || codeEnabled)
  const providerFailed = (message: string) => {
    setFormError(message)
    focusAlert()
  }

  const focusAlert = () => {
    requestAnimationFrame(() => alertRef.current?.focus())
  }

  const finish = () => {
    router.push(nextFromLocation())
    router.refresh()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    setFormError('')
    setNeedsVerification(false)

    const emailError = email.showError()
    const passphraseError = passphrase.showError()
    if (emailError || passphraseError) {
      focusFirst([emailError, passphraseError], [emailRef, passphraseRef])
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
      const result = await signIn.email(
        { email: email.value.trim(), password: passphrase.value },
        captchaHeaders(captchaToken),
      )
      if (result.error) {
        setNeedsVerification(result.error.code === 'EMAIL_NOT_VERIFIED')
        setFormError(authErrorMessage(result.error, 'Adresse e-mail ou mot de passe incorrect.'))
        focusAlert()
        return
      }
      if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setTwoFactor(true)
        setFormError('')
        requestAnimationFrame(() => codeRef.current?.focus())
        return
      }
      finish()
    } catch {
      setFormError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
      focusAlert()
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  const verifyTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    setFormError('')
    const trimmed = code.trim()
    if (!trimmed) {
      setCodeError('Saisissez le code de vérification.')
      codeRef.current?.focus()
      return
    }
    if (!useBackupCode && !/^\d{6}$/.test(trimmed)) {
      setCodeError('Le code contient 6 chiffres.')
      codeRef.current?.focus()
      return
    }
    setCodeError(null)

    submittingRef.current = true
    setLoading(true)
    try {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: trimmed })
        : await authClient.twoFactor.verifyTotp({ code: trimmed })
      if (result.error) {
        setFormError(authErrorMessage(result.error, 'Code incorrect.'))
        focusAlert()
        return
      }
      finish()
    } catch {
      setFormError('Impossible de contacter le serveur. Réessayez.')
      focusAlert()
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  const handlePasskey = async () => {
    if (passkeyLoading) return
    setPasskeyLoading(true)
    setFormError('')
    try {
      const result = await authClient.signIn.passkey()
      if (result.error) {
        setFormError(authErrorMessage(result.error, 'Connexion par passkey impossible sur cet appareil.'))
        focusAlert()
        return
      }
      finish()
    } catch {
      setFormError('Connexion par passkey impossible sur cet appareil. Utilisez votre mot de passe.')
      focusAlert()
    } finally {
      setPasskeyLoading(false)
    }
  }

  const resetTwoFactor = () => {
    setTwoFactor(false)
    setCode('')
    setCodeError(null)
    setFormError('')
    setUseBackupCode(false)
    requestAnimationFrame(() => passphraseRef.current?.focus())
  }

  return (
    <AuthLayout
      title="Bienvenue sur EFLEX"
      description={
        anyPasswordless
          ? 'Connectez-vous ou créez un compte : c’est le même geste.'
          : 'Retrouvez vos projets et vos déploiements.'
      }
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link suppressHydrationWarning href={withNext('/register')} className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <Card className="space-y-6 p-6">
        {twoFactor ? (
          <form onSubmit={verifyTwoFactor} className="space-y-4">
            <div className="space-y-1.5 text-center">
              <h2 className="text-lg font-semibold">Vérification en deux étapes</h2>
              <p className="text-sm text-muted-foreground">
                {useBackupCode
                  ? 'Saisissez l’un de vos codes de secours.'
                  : 'Saisissez le code à 6 chiffres de votre application d’authentification.'}
              </p>
            </div>

            {formError && (
              <FormAlert ref={alertRef} id="login-error">
                {formError}
              </FormAlert>
            )}

            <Input
              ref={codeRef}
              id="two-factor-code"
              label={useBackupCode ? 'Code de secours' : 'Code à 6 chiffres'}
              inputMode={useBackupCode ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => {
                const next = useBackupCode ? event.target.value : event.target.value.replace(/\D/g, '')
                setCode(next)
                if (codeError) {
                  if (!next.trim()) setCodeError('Saisissez le code de vérification.')
                  else if (!useBackupCode && !/^\d{6}$/.test(next.trim())) {
                    setCodeError('Le code contient 6 chiffres.')
                  } else setCodeError(null)
                }
              }}
              onBlur={() => {
                if (!code.trim()) setCodeError('Saisissez le code de vérification.')
              }}
              maxLength={useBackupCode ? 32 : 6}
              error={codeError ?? undefined}
              disabled={loading}
              required
            />

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Vérifier
            </Button>

            <div className="flex flex-col gap-2 text-center text-sm">
              <button
                type="button"
                className="min-h-11 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                disabled={loading}
                onClick={() => {
                  setUseBackupCode((current) => !current)
                  setCode('')
                  setCodeError(null)
                  setFormError('')
                  requestAnimationFrame(() => codeRef.current?.focus())
                }}
              >
                {useBackupCode ? 'Utiliser un code TOTP' : 'Utiliser un code de secours'}
              </button>
              <button
                type="button"
                className="min-h-11 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                disabled={loading}
                onClick={resetTwoFactor}
              >
                Revenir à la connexion
              </button>
            </div>
          </form>
        ) : (
          <>
            {!configReady ? (
              <div aria-busy="true" aria-label="Chargement des méthodes de connexion" className="space-y-3">
                <div className="h-12 animate-pulse rounded-lg bg-muted" />
                <div className="h-12 animate-pulse rounded-lg bg-muted" />
                <div className="h-12 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : (
              <>
                {!(showCode && codeStep === 'code') && (config?.githubEnabled || config?.googleEnabled || passkeySupported) && (
                  <div className="space-y-3">
                    {config?.githubEnabled && (
                      <OAuthButton
                        provider="github"
                        primary
                        lastUsed={lastMethod === 'github'}
                        disabled={loading}
                        onError={providerFailed}
                      />
                    )}
                    {config?.googleEnabled && (
                      <OAuthButton
                        provider="google"
                        primary={!config.githubEnabled}
                        lastUsed={lastMethod === 'google'}
                        disabled={loading}
                        onError={providerFailed}
                      />
                    )}
                    {passkeySupported && (
                      <div className="relative">
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          className="w-full justify-center gap-3 font-medium"
                          onClick={() => void handlePasskey()}
                          loading={passkeyLoading}
                          disabled={loading}
                        >
                          <Fingerprint className="h-5 w-5" aria-hidden="true" />
                          Se connecter avec une passkey
                        </Button>
                        {lastMethod === 'passkey' && (
                          <span className="pointer-events-none absolute -top-2.5 right-3 rounded-full border border-primary/25 bg-background px-2 py-0.5 text-xs font-semibold text-primary">
                            Dernière utilisée
                          </span>
                        )}
                      </div>
                    )}
                    <AuthDivider label="ou par e-mail" />
                  </div>
                )}

                {formError && (
                  <FormAlert ref={alertRef} id="login-error">
                    {formError}
                  </FormAlert>
                )}

                {showCode ? (
                  <EmailCodeForm
                    initialEmail={email.value}
                    onSuccess={finish}
                    onStepChange={setCodeStep}
                    onUsePassword={(address) => {
                      email.change(address)
                      setMode('password')
                      requestAnimationFrame(() => (address ? passphraseRef : emailRef).current?.focus())
                    }}
                    disabled={loading}
                  />
                ) : (
                  <>
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                        label="Mot de passe"
                        autoComplete="current-password"
                        value={passphrase.value}
                        onChange={passphrase.change}
                        onBlur={passphrase.blur}
                        error={passphrase.error}
                        hint={LOGIN_PASSPHRASE_HINT}
                        disabled={loading}
                        required
                      />

                      <div className="flex justify-end">
                        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                          Mot de passe oublié ?
                        </Link>
                      </div>

                      {CAPTCHA_ENABLED && <Turnstile onToken={setCaptchaToken} />}

                      <Button type="submit" size="lg" className="w-full" loading={loading}>
                        Se connecter
                      </Button>
                    </form>

                    {needsVerification && (
                      <p className="text-center text-sm text-muted-foreground">
                        <Link
                          suppressHydrationWarning
                          href={verifyEmailHref(email.value)}
                          className="font-medium text-primary hover:underline"
                        >
                          Renvoyer l’e-mail de vérification
                        </Link>
                      </p>
                    )}

                    {codeEnabled && (
                      <p className="text-center text-sm">
                        <button
                          type="button"
                          onClick={() => {
                            setMode('code')
                            setFormError('')
                          }}
                          className="inline-flex min-h-11 items-center gap-2 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Mail className="h-4 w-4" aria-hidden="true" />
                          Recevoir un code par e-mail
                        </button>
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </AuthLayout>
  )
}
