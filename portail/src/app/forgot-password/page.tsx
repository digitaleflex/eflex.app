'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, authErrorMessage } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(true)

  useEffect(() => {
    fetch('/api/auth/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((config) => setEmailEnabled(Boolean(config.emailEnabled)))
      .catch(() => setEmailEnabled(true))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: '/reset-password',
      })
      if (authError) {
        setError(authErrorMessage(authError, "Impossible d'envoyer le lien. Réessayez dans un instant."))
      } else {
        // Message identique quelle que soit l'existence du compte (anti-énumération).
        setSent(true)
      }
    } catch {
      setError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass">
        <nav className="container flex h-16 items-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo-horizontal.webp" alt="Eflex — accueil" width={1200} height={312} className="h-8 w-auto" priority />
          </Link>
        </nav>
      </header>

      <main id="contenu" className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-display-sm font-bold">Mot de passe oublié</h1>
            <p className="text-muted-foreground">
              Indiquez votre adresse e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe.
            </p>
          </div>

          <Card className="p-6 space-y-5">
            {!emailEnabled ? (
              <div role="status" className="space-y-3 text-sm">
                <p className="text-foreground">La réinitialisation par e-mail sera disponible prochainement.</p>
                <p className="text-muted-foreground">En attendant, contactez le support si vous ne pouvez plus accéder à votre compte.</p>
              </div>
            ) : sent ? (
              <div role="status" className="space-y-3 text-sm text-foreground">
                <p>Si un compte existe avec cette adresse, un lien de réinitialisation vient d&apos;être envoyé.</p>
                <p className="text-muted-foreground">Le lien est valable 1 heure et ne peut être utilisé qu&apos;une fois.</p>
              </div>
            ) : (
              <>
                {error && <p role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    id="forgot-email"
                    label="Adresse e-mail"
                    type="email"
                    autoComplete="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" size="lg" className="w-full" loading={loading}>
                    Envoyer le lien
                  </Button>
                </form>
              </>
            )}
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">Retour à la connexion</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
