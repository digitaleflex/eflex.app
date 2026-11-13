'use client'

import { Suspense, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { AuthLayout } from '@/components/auth/auth-layout'
import { FormAlert } from '@/components/auth/form-alert'
import { PassphraseField, PassphraseGuidance } from '@/components/auth/passphrase-field'
import { useValidatedField } from '@/components/auth/use-validated-field'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { authClient, authErrorMessage } from '@/lib/auth-client'
import {
  validatePassphrase,
  validatePassphraseConfirmation,
} from '@/lib/auth-validation'
import { withNext } from '@/lib/safe-next'

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Nouveau mot de passe"
      description="Idéalement 4 à 5 mots sans lien entre eux ni avec vos informations personnelles."
      footer={
        <Link suppressHydrationWarning href={withNext('/login')} className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
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
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  )
}

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')

  const passphrase = useValidatedField('', validatePassphrase)
  const confirmation = useValidatedField('', (value) =>
    validatePassphraseConfirmation(passphrase.value, value),
  )

  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState('')

  const passphraseRef = useRef<HTMLInputElement>(null)
  const confirmationRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  const goToLogin = () => {
    router.push(withNext('/login'))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submittingRef.current) return
    setFormError('')

    const passphraseError = passphrase.showError()
    const confirmationError = confirmation.showError()
    if (passphraseError || confirmationError) {
      const invalidField = passphraseError ? passphraseRef : confirmationRef
      invalidField.current?.focus()
      return
    }

    submittingRef.current = true
    setLoading(true)
    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword: passphrase.value,
        token: token ?? undefined,
      })
      if (authError) {
        setFormError(authErrorMessage(authError, 'Ce lien est invalide ou expiré. Demandez-en un nouveau.'))
        requestAnimationFrame(() => alertRef.current?.focus())
        return
      }
      setDone(true)
    } catch {
      setFormError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
      requestAnimationFrame(() => alertRef.current?.focus())
    } finally {
      setLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <Card className="space-y-5 p-6">
      {done ? (
        <div role="status" className="space-y-4">
          <p className="text-sm text-foreground">Votre mot de passe a été mis à jour. Vous pouvez vous connecter.</p>
          <Button size="lg" className="w-full" onClick={goToLogin}>
            Se connecter
          </Button>
        </div>
      ) : !token ? (
        <div role="alert" className="space-y-4 text-sm">
          <p className="text-destructive">Ce lien est invalide ou expiré.</p>
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Demander un nouveau lien
          </Link>
        </div>
      ) : (
        <>
          {formError && (
            <FormAlert ref={alertRef} id="reset-password-error">
              {formError}
            </FormAlert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <PassphraseField
              ref={passphraseRef}
              id="new-password"
              label="Nouveau mot de passe"
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
              label="Confirmer le mot de passe"
              autoComplete="new-password"
              value={confirmation.value}
              onChange={confirmation.change}
              onBlur={confirmation.blur}
              error={confirmation.error}
              hint="Saisissez-le à nouveau, espaces compris."
              disabled={loading}
              required
            />

            <PassphraseGuidance />

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Enregistrer le mot de passe
            </Button>
          </form>
        </>
      )}
    </Card>
  )
}
